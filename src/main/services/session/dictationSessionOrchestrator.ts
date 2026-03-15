import type { DictationAudioPayload, DictationSession } from '../../../shared/contracts.js'
import { createIdleSession } from '../../../shared/defaults.js'
import { createId } from '../../../shared/utils.js'
import type { ActiveContextService } from '../context/activeContextService.js'
import type { InsertionEngine } from '../insertion/insertionEngine.js'
import type { OpenRouterService } from '../llm/openRouterService.js'
import type { PermissionService } from '../permissions/permissionService.js'
import type { AppStore } from '../store/appStore.js'
import type { TelemetryService } from '../telemetry/telemetryService.js'
import { HistoryService } from './historyService.js'
import { SessionStore } from './sessionStore.js'

type SessionListener = (session: DictationSession | null) => void
type ProgressiveInsertionSession = ReturnType<InsertionEngine['createProgressiveSession']>

export class DictationSessionOrchestrator {
  private readonly sessions = new SessionStore()
  private readonly history: HistoryService
  private submittingSessionId: string | null = null
  private activeInsertionSession: { sessionId: string; insertion: ProgressiveInsertionSession } | null = null
  private cancelledSessionIds = new Set<string>()

  constructor(
    private readonly store: AppStore,
    private readonly contextService: ActiveContextService,
    private readonly insertionEngine: InsertionEngine,
    private readonly llm: OpenRouterService,
    private readonly telemetry: TelemetryService,
    private readonly permissions: PermissionService,
  ) {
    this.history = new HistoryService(store)
  }

  subscribe(listener: SessionListener): () => void {
    return this.sessions.subscribe(listener)
  }

  getSession(): DictationSession | null {
    return this.sessions.get()
  }

  async startCapture(mode: DictationSession['activationMode']): Promise<void> {
    const currentSession = this.sessions.get()
    if (currentSession && ['arming', 'listening', 'processing', 'streaming'].includes(currentSession.status)) {
      return
    }

    const sessionId = createId('session')
    const startedAt = new Date().toISOString()

    const permissions = await this.permissions.getState()
    if (permissions.microphone === 'denied' || permissions.microphone === 'restricted') {
      this.sessions.set({
        ...createIdleSession(),
        id: sessionId,
        activationMode: mode,
        status: 'permission-required',
        captureIntent: 'none',
        startedAt,
        finishedAt: new Date().toISOString(),
        targetApp: 'Ditado',
        errorMessage: 'Microphone access is required before dictation can start.',
      })
      await this.telemetry.error('microphone-permission-required', { mode })
      return
    }

    this.sessions.set({
      ...createIdleSession(),
      id: sessionId,
      activationMode: mode,
      status: 'listening',
      captureIntent: 'start',
      startedAt,
      targetApp: 'Foreground app',
      noticeMessage: null,
      errorMessage: null,
    })
    await this.telemetry.metric('dictation-started', { mode })

    void this.contextService
      .capture(false, false)
      .then((previewContext) => {
        const activeSession = this.sessions.get()
        if (!activeSession || activeSession.id !== sessionId || activeSession.status !== 'listening') {
          return
        }

        this.sessions.set({
          ...activeSession,
          targetApp: previewContext.appName,
          context: previewContext,
        })
      })
      .catch(() => {
        // Context preview is best-effort and should never block capture start.
      })
  }

  async toggleCapture(): Promise<void> {
    const currentSession = this.sessions.get()
    if (
      !currentSession ||
      ['idle', 'completed', 'notice', 'error', 'permission-required'].includes(currentSession.status)
    ) {
      await this.startCapture('toggle')
      return
    }

    if (currentSession.status === 'listening' && currentSession.activationMode === 'toggle') {
      this.sessions.set({
        ...currentSession,
        status: 'processing',
        captureIntent: 'stop',
        noticeMessage: null,
        errorMessage: null,
      })
    }
  }

  requestStop(mode: DictationSession['activationMode']): void {
    const currentSession = this.sessions.get()
    if (
      !currentSession ||
      currentSession.status !== 'listening' ||
      currentSession.activationMode !== mode ||
      currentSession.captureIntent === 'stop'
    ) {
      return
    }

    this.sessions.set({
      ...currentSession,
      status: 'processing',
      captureIntent: 'stop',
      noticeMessage: null,
      errorMessage: null,
    })
  }

  async cancel(): Promise<void> {
    const currentSession = this.sessions.get()
    if (!currentSession) {
      return
    }

    this.cancelledSessionIds.add(currentSession.id)
    if (this.activeInsertionSession?.sessionId === currentSession.id) {
      this.activeInsertionSession.insertion.cancel()
      this.activeInsertionSession = null
    }

    await this.telemetry.metric('dictation-cancelled', { id: currentSession.id })
    this.sessions.set({
      ...currentSession,
      status: 'idle',
      captureIntent: 'none',
      finishedAt: new Date().toISOString(),
    })
  }

  async showShortPressHint(): Promise<void> {
    await this.telemetry.metric('dictation-short-press-hint', {
      toggleHotkey: this.store.getSettings().toggleHotkey,
    })

    this.sessions.set({
      ...createIdleSession(),
      id: createId('session'),
      activationMode: 'push-to-talk',
      status: 'notice',
      captureIntent: 'none',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      targetApp: 'Ditado',
      noticeMessage: `Segure para ditar. Toggle: ${this.store.getSettings().toggleHotkey}`,
    })
  }

  async submitAudio(mode: DictationSession['activationMode'], payload: DictationAudioPayload): Promise<void> {
    const currentSession = this.sessions.get()
    if (
      !currentSession ||
      !['listening', 'processing'].includes(currentSession.status) ||
      currentSession.activationMode !== mode ||
      this.submittingSessionId === currentSession.id
    ) {
      return
    }

    this.submittingSessionId = currentSession.id
    this.cancelledSessionIds.delete(currentSession.id)

    if (!payload.speechDetected) {
      this.submittingSessionId = null
      await this.showNotice('Nenhuma fala detectada.', 'dictation-no-speech', {
        peakAmplitude: payload.peakAmplitude.toFixed(5),
        rmsAmplitude: payload.rmsAmplitude.toFixed(5),
      })
      return
    }

    try {
      const context = await this.contextService.capture(
        this.store.getSettings().sendContextAutomatically,
        true,
      )
      const insertionPlan = this.insertionEngine.createPlan(context)

      this.sessions.set({
        ...currentSession,
        status: 'processing',
        captureIntent: 'none',
        targetApp: context.appName,
        context,
        insertionPlan,
        noticeMessage: null,
        errorMessage: null,
      })

      const insertion = this.insertionEngine.createProgressiveSession(
        this.store.getSettings().insertionStreamingMode,
      )
      this.activeInsertionSession = {
        sessionId: currentSession.id,
        insertion,
      }
      let partialText = ''

      const response = await this.llm.stream(
        {
          audioBase64: payload.wavBase64,
          audioMimeType: payload.mimeType,
          languageHint: payload.languageHint,
          context,
          modelId: this.store.getSettings().modelId,
        },
        async (delta) => {
          if (this.cancelledSessionIds.has(currentSession.id)) {
            return
          }

          partialText += delta
          const activeSession = this.sessions.get()
          if (activeSession?.id === currentSession.id) {
            this.sessions.set({
              ...activeSession,
              status: 'streaming',
              partialText,
            })
          }
          await insertion.append(delta)
        },
      )

      if (this.cancelledSessionIds.has(currentSession.id)) {
        return
      }

      if (!response.text.trim()) {
        await insertion.finalize('')
        await this.showNotice('Nenhum texto final retornado.', 'dictation-empty-output', {
          modelId: this.store.getSettings().modelId,
        })
        return
      }

      await insertion.finalize(response.text)
      const finishedAt = new Date().toISOString()
      const completedSession = {
        ...(this.sessions.get() ?? currentSession),
        status: 'completed' as const,
        captureIntent: 'none' as const,
        finishedAt,
        partialText: response.text,
        finalText: response.text,
      }

      await this.history.appendCompletedSession(completedSession, response, payload)
      this.sessions.set(completedSession)
      await this.telemetry.metric('dictation-completed', {
        id: completedSession.id,
        latencyMs: response.latencyMs,
        finishReason: response.finishReason ?? 'unknown',
      })
    } catch (error) {
      if (this.cancelledSessionIds.has(currentSession.id)) {
        return
      }

      const message = error instanceof Error ? error.message : 'Unknown dictation error'
      const lastText = this.sessions.get()?.partialText ?? ''

      if (lastText) {
        await this.insertionEngine
          .createProgressiveSession('all-at-once')
          .recoverToClipboard(lastText)
      }

      const activeSession = this.sessions.get() ?? currentSession
      this.sessions.set({
        ...activeSession,
        status: 'error',
        errorMessage: lastText ? `${message} Latest text copied to clipboard.` : message,
        finishedAt: new Date().toISOString(),
      })

      await this.telemetry.error('dictation-failed', {
        id: activeSession.id,
        message,
      })
    } finally {
      if (this.activeInsertionSession?.sessionId === currentSession.id) {
        this.activeInsertionSession = null
      }
      this.cancelledSessionIds.delete(currentSession.id)
      if (this.submittingSessionId === currentSession.id) {
        this.submittingSessionId = null
      }
    }
  }

  private async showNotice(
    message: string,
    telemetryName: string,
    detail: Record<string, string> = {},
  ): Promise<void> {
    await this.telemetry.metric(telemetryName, detail)
    const current = this.sessions.get()
    this.sessions.set({
      ...createIdleSession(),
      id: current?.id ?? createId('session'),
      activationMode: current?.activationMode ?? 'push-to-talk',
      status: 'notice',
      captureIntent: 'none',
      startedAt: current?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      targetApp: current?.targetApp ?? 'Ditado',
      context: current?.context ?? createIdleSession().context,
      insertionPlan: current?.insertionPlan ?? createIdleSession().insertionPlan,
      noticeMessage: message,
      errorMessage: null,
    })
  }

  private requireCurrent(sessionId: string): DictationSession {
    const session = this.sessions.get()
    if (!session || session.id !== sessionId) {
      return {
        ...createIdleSession(),
        id: sessionId,
      }
    }

    return session
  }
}
