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

export class DictationSessionOrchestrator {
  private readonly sessions = new SessionStore()
  private readonly history = new HistoryService(this.store)
  private submittingSessionId: string | null = null

  constructor(
    private readonly store: AppStore,
    private readonly contextService: ActiveContextService,
    private readonly insertionEngine: InsertionEngine,
    private readonly llm: OpenRouterService,
    private readonly telemetry: TelemetryService,
    private readonly permissions: PermissionService,
  ) {}

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

    this.sessions.set({
      ...createIdleSession(),
      id: sessionId,
      activationMode: mode,
      status: 'arming',
      captureIntent: 'start',
      startedAt,
      targetApp: 'Foreground app',
      noticeMessage: null,
      errorMessage: null,
    })

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
      ...this.requireCurrent(sessionId),
      status: 'listening',
      captureIntent: 'start',
    })
    await this.telemetry.metric('dictation-started', { mode })
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
        captureIntent: 'stop',
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
      captureIntent: 'stop',
    })
  }

  async cancel(): Promise<void> {
    const currentSession = this.sessions.get()
    if (!currentSession) {
      return
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
      currentSession.status !== 'listening' ||
      currentSession.activationMode !== mode ||
      this.submittingSessionId === currentSession.id
    ) {
      return
    }

    this.submittingSessionId = currentSession.id

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

      this.sessions.set(completedSession)
      await this.history.appendCompletedSession(completedSession, response, payload)
      await this.telemetry.metric('dictation-completed', {
        id: completedSession.id,
        latencyMs: response.latencyMs,
        finishReason: response.finishReason ?? 'unknown',
      })
    } catch (error) {
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
