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
  private readonly historyListeners = new Set<() => void>()
  private submittingSessionId: string | null = null
  private activeInsertionSession: { sessionId: string; insertion: ProgressiveInsertionSession } | null = null
  private cancelledSessionIds = new Set<string>()
  private contextCaptureBySessionId = new Map<string, Promise<Awaited<ReturnType<ActiveContextService['capture']>>>>()
  private speechEndedAtBySessionId = new Map<string, number>()

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

  subscribeHistoryUpdated(listener: () => void): () => void {
    this.historyListeners.add(listener)
    return () => { this.historyListeners.delete(listener) }
  }

  private notifyHistoryUpdated(): void {
    for (const listener of this.historyListeners) {
      listener()
    }
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

    await this.telemetry.startSession(sessionId, {
      activationMode: mode,
      targetApp: 'Foreground app',
    })
    await this.telemetry.metric('dictation-started', { mode }, { sessionId })

    if (this.store.getSettings().insertionStreamingMode === 'letter-by-letter') {
      try {
        this.insertionEngine.warmupLetterInput()
      } catch {
        // Warmup is opportunistic; the insertion path will decide whether to fallback.
      }
    }

    const shouldCaptureSelectionImmediately =
      mode === 'toggle' && this.store.getSettings().sendContextAutomatically

    const contextCapture = this.contextService
      .capture(shouldCaptureSelectionImmediately, shouldCaptureSelectionImmediately)
      .then(async (previewContext) => {
        const activeSession = this.sessions.get()
        if (
          !activeSession ||
          activeSession.id !== sessionId ||
          !['arming', 'listening', 'processing', 'streaming'].includes(activeSession.status)
        ) {
          return previewContext
        }

        this.sessions.set({
          ...activeSession,
          targetApp: previewContext.appName,
          context: previewContext,
        })
        await this.telemetry.annotateSession(sessionId, {
          targetApp: previewContext.appName,
          contextConfidence: previewContext.confidence,
          permissionsGranted: previewContext.permissionsGranted,
          selectedTextPresent: Boolean(previewContext.selectedText),
        })
        this.telemetry.sessionEvent(sessionId, 'context-captured', {
          selectedTextPresent: Boolean(previewContext.selectedText),
          confidence: previewContext.confidence,
        })

        return previewContext
      })
      .catch(() => {
        // Context preview is best-effort and should never block capture start.
        return createIdleSession().context
      })
    this.contextCaptureBySessionId.set(sessionId, contextCapture)
  }

  markRecorderStarted(sessionId: string): void {
    const currentSession = this.sessions.get()
    if (!currentSession || currentSession.id !== sessionId || currentSession.status !== 'arming') {
      return
    }

    this.sessions.set({
      ...currentSession,
      status: 'listening',
    })
    this.telemetry.sessionEvent(sessionId, 'recorder-started')
  }

  async markRecorderFailed(sessionId: string, reason: string): Promise<void> {
    const currentSession = this.sessions.get()
    if (!currentSession || currentSession.id !== sessionId || currentSession.status !== 'arming') {
      return
    }

    const permissions = await this.permissions.getState().catch(() => null)
    const message = reason || 'Unable to start microphone capture.'
    const microphoneBlocked =
      permissions?.microphone === 'denied' || permissions?.microphone === 'restricted'

    this.sessions.set({
      ...currentSession,
      status: microphoneBlocked ? 'permission-required' : 'error',
      captureIntent: 'none',
      errorMessage: microphoneBlocked
        ? 'Microphone access is required before dictation can start.'
        : message,
      finishedAt: new Date().toISOString(),
    })

    if (microphoneBlocked) {
      await this.telemetry.error('microphone-permission-required', {
        mode: currentSession.activationMode,
      }, { sessionId })
      await this.telemetry.finishSession(sessionId, 'permission-required', {
        reason: 'microphone-permission-required',
      })
      return
    }

    await this.telemetry.error('recorder-start-failed', {
      id: currentSession.id,
      message,
    }, { sessionId })
    await this.telemetry.finishSession(sessionId, 'error', {
      reason: 'recorder-start-failed',
      'error.message': message,
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
      const now = new Date().toISOString()
      this.speechEndedAtBySessionId.set(currentSession.id, performance.now())
      this.sessions.set({
        ...currentSession,
        status: 'processing',
        captureIntent: 'stop',
        processingStartedAt: now,
        noticeMessage: null,
        errorMessage: null,
      })
    }
  }

  requestStop(mode: DictationSession['activationMode']): void {
    const currentSession = this.sessions.get()
    if (
      !currentSession ||
      !['arming', 'listening'].includes(currentSession.status) ||
      currentSession.activationMode !== mode ||
      currentSession.captureIntent === 'stop'
    ) {
      return
    }

    const now = new Date().toISOString()
    this.speechEndedAtBySessionId.set(currentSession.id, performance.now())
    this.sessions.set({
      ...currentSession,
      status: 'processing',
      captureIntent: 'stop',
      processingStartedAt: now,
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

    await this.telemetry.metric('dictation-cancelled', { id: currentSession.id }, { sessionId: currentSession.id })
    await this.telemetry.finishSession(currentSession.id, 'cancelled', {
      cancelledAt: new Date().toISOString(),
    })
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
      noticeMessage: `notices.holdToDictate::${this.store.getSettings().toggleHotkey}`,
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
      await this.showNotice('notices.noSpeechDetected', 'dictation-no-speech', {
        peakAmplitude: payload.peakAmplitude.toFixed(5),
        rmsAmplitude: payload.rmsAmplitude.toFixed(5),
      }, currentSession.id)
      return
    }

    try {
      const contextCapture = this.contextCaptureBySessionId.get(currentSession.id)
      let context = contextCapture ? await contextCapture : currentSession.context

      if (
        currentSession.activationMode === 'push-to-talk' &&
        this.store.getSettings().sendContextAutomatically &&
        !context.selectedText
      ) {
        const submitContext = await this.contextService.capture(true, true)
        context = {
          ...context,
          selectedText: submitContext.selectedText,
          confidence: submitContext.selectedText ? submitContext.confidence : context.confidence,
        }
      }
      const insertionPlan = this.insertionEngine.createPlan(context)
      await this.telemetry.annotateSession(currentSession.id, {
        targetApp: context.appName,
        insertionStrategy: insertionPlan.strategy,
        insertionCapability: insertionPlan.capability,
        selectedTextPresent: Boolean(context.selectedText),
        requestedMode: this.store.getSettings().insertionStreamingMode,
      })
      this.telemetry.sessionEvent(currentSession.id, 'submission-started', {
        hasSelectedText: Boolean(context.selectedText),
      })

      const processingStartedAt = new Date().toISOString()
      if (!this.speechEndedAtBySessionId.has(currentSession.id)) {
        this.speechEndedAtBySessionId.set(currentSession.id, performance.now())
      }
      const speechEndedAt = this.speechEndedAtBySessionId.get(currentSession.id)!

      this.sessions.set({
        ...currentSession,
        status: 'processing',
        captureIntent: 'none',
        processingStartedAt,
        targetApp: context.appName,
        context,
        insertionPlan,
        noticeMessage: null,
        errorMessage: null,
      })

      const insertion = this.insertionEngine.createProgressiveSession(
        this.store.getSettings().insertionStreamingMode,
      )
      await insertion.warmup()
      this.activeInsertionSession = {
        sessionId: currentSession.id,
        insertion,
      }
      let partialText = ''
      let streamingStarted = false
      let firstTokenAt = 0

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

          if (!streamingStarted) {
            streamingStarted = true
            firstTokenAt = performance.now()
            this.telemetry.sessionEvent(currentSession.id, 'streaming-started')
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
        await this.showNotice('notices.noFinalText', 'dictation-empty-output', {
          modelId: this.store.getSettings().modelId,
        }, currentSession.id)
        return
      }

      const execution = await insertion.finalize(response.text)
      const completedAt = performance.now()
      if (this.cancelledSessionIds.has(currentSession.id) || this.sessions.get()?.id !== currentSession.id) {
        return
      }

      const timeToFirstTokenMs = firstTokenAt > 0 ? Math.round(firstTokenAt - speechEndedAt) : 0
      const timeToCompleteMs = Math.round(completedAt - speechEndedAt)

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
      await this.telemetry.metric('dictation-completed', {
        id: completedSession.id,
        latencyMs: response.latencyMs,
        finishReason: response.finishReason ?? 'unknown',
        fallbackUsed: execution.fallbackUsed,
        insertionMethod: execution.insertionMethod,
        requestedMode: execution.requestedMode,
        effectiveMode: execution.effectiveMode,
      }, { sessionId: completedSession.id })
      await this.telemetry.finishSession(completedSession.id, 'completed', {
        latencyMs: response.latencyMs,
        finishReason: response.finishReason ?? 'unknown',
        fallbackUsed: execution.fallbackUsed,
        insertionMethod: execution.insertionMethod,
        requestedMode: execution.requestedMode,
        effectiveMode: execution.effectiveMode,
      })
      try {
        await this.history.appendCompletedSession(completedSession, response, payload, execution, { timeToFirstTokenMs, timeToCompleteMs })
        this.notifyHistoryUpdated()
      } catch {
        // History persistence must not delay or mask a successful dictation.
      }
    } catch (error) {
      if (this.cancelledSessionIds.has(currentSession.id)) {
        return
      }

      const message = error instanceof Error ? error.message : 'Unknown dictation error'
      const lastText = this.sessions.get()?.partialText ?? ''
      const execution =
        this.activeInsertionSession?.sessionId === currentSession.id
          ? this.activeInsertionSession.insertion.getExecutionReport()
          : undefined

      if (lastText) {
        await this.insertionEngine
          .createProgressiveSession('all-at-once')
          .recoverToClipboard(lastText)
      }

      const activeSession = this.sessions.get() ?? currentSession
      const erroredSession: DictationSession = {
        ...activeSession,
        status: 'error',
        errorMessage: lastText ? `${message} Latest text copied to clipboard.` : message,
        finishedAt: new Date().toISOString(),
      }
      this.sessions.set(erroredSession)

      try {
        await this.history.appendFailedSession(erroredSession, payload, execution)
        this.notifyHistoryUpdated()
      } catch {
        // History persistence must not mask the primary dictation failure.
      }

      await this.telemetry.error('dictation-failed', {
        id: activeSession.id,
        message,
        fallbackUsed: execution?.fallbackUsed ?? false,
        insertionMethod: execution?.insertionMethod ?? 'clipboard-all-at-once',
      }, { sessionId: activeSession.id, exception: error })
      await this.telemetry.finishSession(activeSession.id, 'error', {
        'error.message': message,
        fallbackUsed: execution?.fallbackUsed ?? false,
        insertionMethod: execution?.insertionMethod ?? 'clipboard-all-at-once',
        recoveredToClipboard: Boolean(lastText),
      })
    } finally {
      this.contextCaptureBySessionId.delete(currentSession.id)
      this.speechEndedAtBySessionId.delete(currentSession.id)
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
    sessionId?: string,
  ): Promise<void> {
    await this.telemetry.metric(telemetryName, detail, sessionId ? { sessionId } : {})
    if (sessionId) {
      await this.telemetry.finishSession(sessionId, 'notice', {
        noticeName: telemetryName,
        ...detail,
      })
    }
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
}
