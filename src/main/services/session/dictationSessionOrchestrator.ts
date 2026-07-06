import type { DictationAudioPayload, DictationSession } from '../../../shared/contracts.js'
import { createIdleSession } from '../../../shared/defaults.js'
import { createId } from '../../../shared/utils.js'
import type { ActiveContextService } from '../context/activeContextService.js'
import type { InsertionEngine } from '../insertion/insertionEngine.js'
import type { OpenRouterService } from '../llm/openRouterService.js'
import type { PermissionService } from '../permissions/permissionService.js'
import type { SyncoreAppData } from '../store/syncoreAppData.js'
import { HistoryService, type HistoryTimingMarks } from './historyService.js'

type SessionListener = (session: DictationSession | null) => void
type ProgressiveInsertionSession = ReturnType<InsertionEngine['createProgressiveSession']>

export class DictationSessionOrchestrator {
  private readonly history: HistoryService
  private readonly sessionListeners = new Set<SessionListener>()
  private readonly historyListeners = new Set<() => void>()
  private currentSession: DictationSession | null = null
  private submittingSessionId: string | null = null
  private activeInsertionSession: { sessionId: string; insertion: ProgressiveInsertionSession } | null = null
  private cancelledSessionIds = new Set<string>()
  private contextCaptureBySessionId = new Map<string, Promise<Awaited<ReturnType<ActiveContextService['capture']>>>>()
  private speechEndedAtBySessionId = new Map<string, number>()
  private timingMarksBySessionId = new Map<string, HistoryTimingMarks>()

  constructor(
    private readonly store: SyncoreAppData,
    private readonly contextService: ActiveContextService,
    private readonly insertionEngine: InsertionEngine,
    private readonly llm: OpenRouterService,
    private readonly permissions: PermissionService,
  ) {
    this.history = new HistoryService(store)
  }

  subscribe(listener: SessionListener): () => void {
    this.sessionListeners.add(listener)
    listener(this.currentSession)
    return () => {
      this.sessionListeners.delete(listener)
    }
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

  getSessionSnapshot(): DictationSession | null {
    return this.currentSession
  }

  async refreshSessionSnapshot(): Promise<DictationSession | null> {
    return this.publishSession(await this.store.getActiveSession())
  }

  async dismissCurrentSession(): Promise<void> {
    this.publishSession(await this.store.dismissCurrentSession())
  }

  private publishSession(session: DictationSession | null): DictationSession | null {
    this.currentSession = session
    for (const listener of this.sessionListeners) {
      listener(this.currentSession)
    }
    return session
  }

  async startCapture(mode: DictationSession['activationMode']): Promise<void> {
    const currentSession = this.currentSession ?? await this.refreshSessionSnapshot()
    if (currentSession && ['arming', 'listening', 'processing', 'streaming'].includes(currentSession.status)) {
      return
    }

    const sessionId = createId('session')
    const startedAt = new Date().toISOString()
    const contextPreviewStartedAt = new Date().toISOString()

    const initialSession: DictationSession = {
      ...createIdleSession(),
      id: sessionId,
      activationMode: mode,
      status: 'arming',
      captureIntent: 'start',
      startedAt,
      targetApp: 'Foreground app',
      noticeMessage: null,
      errorMessage: null,
    }
    await this.store.startSession(initialSession)
    this.publishSession(initialSession)

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
        this.updateTimingMarks(sessionId, {
          contextPreviewStartedAt,
          contextPreviewCompletedAt: new Date().toISOString(),
        })
        const activeSession = this.currentSession
        if (
          !activeSession ||
          activeSession.id !== sessionId ||
          !['arming', 'listening', 'processing', 'streaming'].includes(activeSession.status)
        ) {
          return previewContext
        }

        await this.store.updateSessionContext(sessionId, previewContext.appName, previewContext)
        this.publishSession({
          ...activeSession,
          targetApp: previewContext.appName,
          context: previewContext,
        })
        return previewContext
      })
      .catch(() => {
        // Context preview is best-effort and should never block capture start.
        this.updateTimingMarks(sessionId, {
          contextPreviewStartedAt,
          contextPreviewCompletedAt: new Date().toISOString(),
        })
        return createIdleSession().context
      })
    this.contextCaptureBySessionId.set(sessionId, contextCapture)
    this.updateTimingMarks(sessionId, { contextPreviewStartedAt })
  }

  async markRecorderStarted(sessionId: string): Promise<void> {
    const currentSession = this.currentSession ?? await this.refreshSessionSnapshot()
    if (!currentSession || currentSession.id !== sessionId || currentSession.status !== 'arming') {
      return
    }

    await this.store.markSessionListening(sessionId)
    this.publishSession({
      ...currentSession,
      status: 'listening',
    })
  }

  async markRecorderFailed(sessionId: string, reason: string): Promise<void> {
    const currentSession = this.currentSession ?? await this.refreshSessionSnapshot()
    if (!currentSession || currentSession.id !== sessionId || currentSession.status !== 'arming') {
      return
    }

    const permissions = await this.permissions.getState().catch(() => null)
    const message = reason || 'Unable to start microphone capture.'
    const microphoneBlocked =
      permissions?.microphone === 'denied' || permissions?.microphone === 'restricted'
    const failedStatus: 'error' | 'permission-required' = microphoneBlocked ? 'permission-required' : 'error'

    const erroredSession: DictationSession = {
      ...currentSession,
      status: failedStatus,
      captureIntent: 'none',
      errorMessage: microphoneBlocked
        ? 'Microphone access is required before dictation can start.'
        : message,
      finishedAt: new Date().toISOString(),
    }
    await this.store.markSessionRecorderFailed(
      sessionId,
      failedStatus,
      erroredSession.errorMessage ?? message,
      erroredSession.finishedAt ?? new Date().toISOString(),
    )
    this.publishSession(erroredSession)

    if (microphoneBlocked) {
      return
    }
  }

  async toggleCapture(): Promise<void> {
    const currentSession = this.currentSession ?? await this.refreshSessionSnapshot()
    if (
      !currentSession ||
      ['completed', 'notice', 'error', 'permission-required', 'cancelled'].includes(currentSession.status)
    ) {
      await this.startCapture('toggle')
      return
    }

    if (currentSession.status === 'listening' && currentSession.activationMode === 'toggle') {
      const now = new Date().toISOString()
      this.updateTimingMarks(currentSession.id, { stopRequestedAt: now })
      this.speechEndedAtBySessionId.set(currentSession.id, performance.now())
      await this.store.requestSessionStop(currentSession.id, now)
      this.publishSession({
        ...currentSession,
        status: 'processing',
        captureIntent: 'stop',
        processingStartedAt: now,
        noticeMessage: null,
        errorMessage: null,
      })
    }
  }

  async requestStop(mode: DictationSession['activationMode']): Promise<void> {
    const currentSession = this.currentSession ?? await this.refreshSessionSnapshot()
    if (
      !currentSession ||
      !['arming', 'listening'].includes(currentSession.status) ||
      currentSession.activationMode !== mode ||
      currentSession.captureIntent === 'stop'
    ) {
      return
    }

    const now = new Date().toISOString()
    this.updateTimingMarks(currentSession.id, { stopRequestedAt: now })
    this.speechEndedAtBySessionId.set(currentSession.id, performance.now())
    await this.store.requestSessionStop(currentSession.id, now)
    this.publishSession({
      ...currentSession,
      status: 'processing',
      captureIntent: 'stop',
      processingStartedAt: now,
      noticeMessage: null,
      errorMessage: null,
    })
  }

  async cancel(): Promise<void> {
    const currentSession = this.currentSession ?? await this.refreshSessionSnapshot()
    if (!currentSession) {
      return
    }

    this.cancelledSessionIds.add(currentSession.id)
    if (this.activeInsertionSession?.sessionId === currentSession.id) {
      this.activeInsertionSession.insertion.cancel()
      this.activeInsertionSession = null
    }

    const finishedAt = new Date().toISOString()
    await this.store.cancelSession(currentSession.id, finishedAt)
    this.publishSession({
      ...currentSession,
      status: 'cancelled',
      captureIntent: 'none',
      finishedAt,
    })
  }

  async showShortPressHint(): Promise<void> {
    const now = new Date().toISOString()
    const noticeSession: DictationSession = {
      ...createIdleSession(),
      id: createId('session'),
      activationMode: 'push-to-talk',
      status: 'notice',
      captureIntent: 'none',
      startedAt: now,
      finishedAt: now,
      targetApp: 'Ditado',
      noticeMessage: 'notices.doubleTapToToggle',
    }
    await this.store.showSessionNotice(noticeSession)
    this.publishSession(noticeSession)
  }

  async submitAudio(mode: DictationSession['activationMode'], payload: DictationAudioPayload): Promise<void> {
    const currentSession = this.currentSession ?? await this.refreshSessionSnapshot()
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

    if (!payload.speechDetected || payload.durationMs < 1500) {
      this.submittingSessionId = null
      await this.showNotice('notices.noSpeechDetected')
      return
    }

    try {
      this.updateTimingMarks(currentSession.id, {
        submissionStartedAt: new Date().toISOString(),
      })
      const contextCapture = this.contextCaptureBySessionId.get(currentSession.id)
      let context = contextCapture ? await contextCapture : currentSession.context

      if (
        currentSession.activationMode === 'push-to-talk' &&
        this.store.getSettings().sendContextAutomatically &&
        !context.selectedText
      ) {
        const contextRefreshStartedAt = new Date().toISOString()
        const submitContext = await this.contextService.capture(true, true)
        this.updateTimingMarks(currentSession.id, {
          contextRefreshStartedAt,
          contextRefreshCompletedAt: new Date().toISOString(),
        })
        context = {
          ...context,
          selectedText: submitContext.selectedText,
          confidence: submitContext.selectedText ? submitContext.confidence : context.confidence,
        }
      }
      const insertionPlan = this.insertionEngine.createPlan(context)
      const processingStartedAt = new Date().toISOString()
      if (!this.speechEndedAtBySessionId.has(currentSession.id)) {
        this.speechEndedAtBySessionId.set(currentSession.id, performance.now())
      }

      await this.store.markSessionProcessing(
        currentSession.id,
        processingStartedAt,
        context.appName,
        context,
        insertionPlan,
      )
      this.publishSession({
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
      let firstTokenAtIso: string | null = null

      const response = await this.llm.stream(
        {
          audioBase64: payload.audioBase64,
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
            firstTokenAtIso = new Date().toISOString()
          }
          partialText += delta
          const activeSession = this.currentSession
          if (activeSession?.id === currentSession.id) {
            await this.store.appendSessionPartial(currentSession.id, partialText)
            this.publishSession({
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
        await this.showNotice('notices.noFinalText')
        return
      }

      const execution = await insertion.finalize(response.text)
      if (this.cancelledSessionIds.has(currentSession.id) || this.currentSession?.id !== currentSession.id) {
        return
      }

      const finishedAt = new Date().toISOString()
      const completedSession = {
        ...(this.currentSession ?? currentSession),
        status: 'completed' as const,
        captureIntent: 'none' as const,
        finishedAt,
        partialText: response.text,
        finalText: response.text,
      }

      await this.store.completeSession(currentSession.id, finishedAt, response.text, response.text)
      this.publishSession(completedSession)
      try {
        await this.history.appendCompletedSession(completedSession, response, payload, execution, {
          firstTokenAt: firstTokenAtIso,
          marks: this.timingMarksBySessionId.get(currentSession.id),
        })
        this.notifyHistoryUpdated()
      } catch {
        // History persistence must not delay or mask a successful dictation.
      }
    } catch (error) {
      if (this.cancelledSessionIds.has(currentSession.id)) {
        return
      }

      const message = error instanceof Error ? error.message : 'Unknown dictation error'
      const lastText = this.currentSession?.partialText ?? ''
      const execution =
        this.activeInsertionSession?.sessionId === currentSession.id
          ? this.activeInsertionSession.insertion.getExecutionReport()
          : undefined

      if (lastText) {
        await this.insertionEngine
          .createProgressiveSession('all-at-once')
          .recoverToClipboard(lastText)
      }

      const activeSession = this.currentSession ?? currentSession
      const erroredSession: DictationSession = {
        ...activeSession,
        status: 'error',
        errorMessage: lastText ? `${message} Latest text copied to clipboard.` : message,
        finishedAt: new Date().toISOString(),
      }
      await this.store.failSession(
        currentSession.id,
        erroredSession.finishedAt ?? new Date().toISOString(),
        erroredSession.errorMessage ?? message,
        lastText,
      )
      this.publishSession(erroredSession)

      try {
        await this.history.appendFailedSession(
          erroredSession,
          payload,
          execution,
          this.timingMarksBySessionId.get(currentSession.id),
        )
        this.notifyHistoryUpdated()
      } catch {
        // History persistence must not mask the primary dictation failure.
      }

    } finally {
      this.contextCaptureBySessionId.delete(currentSession.id)
      this.speechEndedAtBySessionId.delete(currentSession.id)
      this.timingMarksBySessionId.delete(currentSession.id)
      if (this.activeInsertionSession?.sessionId === currentSession.id) {
        this.activeInsertionSession = null
      }
      this.cancelledSessionIds.delete(currentSession.id)
      if (this.submittingSessionId === currentSession.id) {
        this.submittingSessionId = null
      }
    }
  }

  private updateTimingMarks(sessionId: string, patch: HistoryTimingMarks): void {
    const current = this.timingMarksBySessionId.get(sessionId) ?? {}
    this.timingMarksBySessionId.set(sessionId, {
      ...current,
      ...patch,
    })
  }

  private async showNotice(message: string): Promise<void> {
    const current = this.currentSession
    const now = new Date().toISOString()
    const noticeSession: DictationSession = {
      ...createIdleSession(),
      id: current?.id ?? createId('session'),
      activationMode: current?.activationMode ?? 'push-to-talk',
      status: 'notice',
      captureIntent: 'none',
      startedAt: current?.startedAt ?? now,
      finishedAt: now,
      targetApp: current?.targetApp ?? 'Ditado',
      context: current?.context ?? createIdleSession().context,
      insertionPlan: current?.insertionPlan ?? createIdleSession().insertionPlan,
      noticeMessage: message,
      errorMessage: null,
    }
    await this.store.showSessionNotice(noticeSession)
    this.publishSession(noticeSession)
  }
}
