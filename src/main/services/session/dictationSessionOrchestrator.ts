import type { SyncoreClient } from 'syncorejs'

import { api } from '../../../../syncore/_generated/api.js'
import type {
  ActivationMode,
  DictationAudioPayload,
  DictationSession,
  Settings,
} from '../../../shared/contracts.js'
import { defaultInsertionPlan, emptyContextSnapshot } from '../../../shared/defaults.js'
import { createId } from '../../../shared/utils.js'
import type { ActiveContextService } from '../context/activeContextService.js'
import type {
  InsertionEngine,
  InsertionExecutionReport,
} from '../insertion/insertionEngine.js'
import type { OpenRouterService } from '../llm/openRouterService.js'
import type { PermissionService } from '../permissions/permissionService.js'
import {
  createSessionAudit,
  type HistoryTimingMarks,
} from './historyService.js'

type ProgressiveInsertionSession = ReturnType<InsertionEngine['createProgressiveSession']>

const liveStatuses = ['arming', 'listening', 'processing', 'streaming'] as const

const isLiveSession = (session: DictationSession | null): session is DictationSession =>
  Boolean(session && liveStatuses.some((status) => status === session.status))

export class DictationSessionOrchestrator {
  private submittingSessionId: string | null = null
  private activeInsertionSession: {
    sessionId: string
    insertion: ProgressiveInsertionSession
  } | null = null
  private readonly cancelledSessionIds = new Set<string>()
  private readonly contextCaptureBySessionId = new Map<
    string,
    Promise<Awaited<ReturnType<ActiveContextService['capture']>>>
  >()
  private readonly timingMarksBySessionId = new Map<string, HistoryTimingMarks>()
  private pendingPartial: { sessionId: string; text: string } | null = null
  private partialFlushTimer: ReturnType<typeof setTimeout> | null = null
  private partialWriteChain: Promise<void> = Promise.resolve()
  private partialWriteError: Error | null = null

  constructor(
    private readonly client: SyncoreClient,
    private readonly getSettings: () => Settings,
    private readonly getSession: () => DictationSession | null,
    private readonly contextService: ActiveContextService,
    private readonly insertionEngine: InsertionEngine,
    private readonly llm: OpenRouterService,
    private readonly permissions: PermissionService,
  ) {}

  async dismissSessionNotice(): Promise<void> {
    await this.client.mutation(api.sessions.dismissCurrent)
  }

  async startCapture(mode: ActivationMode): Promise<void> {
    if (isLiveSession(this.getSession())) {
      return
    }

    const settings = this.getSettings()
    const sessionId = createId('session')
    const startedAt = new Date().toISOString()
    const contextPreviewStartedAt = startedAt
    await this.client.mutation(api.sessions.start, {
      sessionId,
      activationMode: mode,
      startedAt,
      targetApp: 'Foreground app',
      context: emptyContextSnapshot,
      insertionPlan: defaultInsertionPlan,
      modelId: settings.modelId,
      requestedMode: settings.insertionStreamingMode,
    })

    if (settings.insertionStreamingMode === 'letter-by-letter') {
      try {
        this.insertionEngine.warmupLetterInput()
      } catch {
        // Native warmup is opportunistic; insertion reports any clipboard recovery.
      }
    }

    const shouldCaptureSelection =
      mode === 'toggle' && settings.sendContextAutomatically
    const contextCapture = this.contextService
      .capture(shouldCaptureSelection, shouldCaptureSelection)
      .then(async (context) => {
        this.updateTimingMarks(sessionId, {
          contextPreviewStartedAt,
          contextPreviewCompletedAt: new Date().toISOString(),
        })
        const active = await this.client.query(api.sessions.active)
        if (
          active?.sessionId === sessionId &&
          liveStatuses.some((status) => status === active.status)
        ) {
          await this.client.mutation(api.sessions.updateContext, {
            sessionId,
            targetApp: context.appName,
            context,
          })
        }
        return context
      })
      .catch(() => {
        this.updateTimingMarks(sessionId, {
          contextPreviewStartedAt,
          contextPreviewCompletedAt: new Date().toISOString(),
        })
        return emptyContextSnapshot
      })
    this.contextCaptureBySessionId.set(sessionId, contextCapture)
    this.updateTimingMarks(sessionId, { contextPreviewStartedAt })
  }

  async markRecorderStarted(sessionId: string): Promise<void> {
    const session = this.getSession()
    if (session?.sessionId !== sessionId || session.status !== 'arming') {
      return
    }
    await this.client.mutation(api.sessions.markListening, { sessionId })
  }

  async markRecorderFailed(sessionId: string, reason: string): Promise<void> {
    const session = this.getSession()
    if (session?.sessionId !== sessionId || session.status !== 'arming') {
      return
    }
    const permissions = await this.permissions.getState().catch(() => null)
    const microphoneBlocked =
      permissions?.microphone === 'denied' ||
      permissions?.microphone === 'restricted'
    const errorMessage = microphoneBlocked
      ? 'Microphone access is required before dictation can start.'
      : reason || 'Unable to start microphone capture.'
    await this.client.mutation(api.sessions.markRecorderFailed, {
      sessionId,
      status: microphoneBlocked ? 'permission-required' : 'error',
      errorMessage,
      finishedAt: new Date().toISOString(),
    })
  }

  async toggleCapture(): Promise<void> {
    const session = this.getSession()
    if (!isLiveSession(session)) {
      await this.startCapture('toggle')
      return
    }
    if (session.status === 'listening' && session.activationMode === 'toggle') {
      await this.stopSession(session)
    }
  }

  async requestStop(mode: ActivationMode): Promise<void> {
    const session = this.getSession()
    if (
      !session ||
      !['arming', 'listening'].includes(session.status) ||
      session.activationMode !== mode ||
      session.captureIntent === 'stop'
    ) {
      return
    }
    await this.stopSession(session)
  }

  private async stopSession(session: DictationSession): Promise<void> {
    const processingStartedAt = new Date().toISOString()
    this.updateTimingMarks(session.sessionId, {
      stopRequestedAt: processingStartedAt,
    })
    await this.client.mutation(api.sessions.requestStop, {
      sessionId: session.sessionId,
      processingStartedAt,
    })
  }

  async cancel(): Promise<void> {
    const session = this.getSession()
    if (!isLiveSession(session)) {
      return
    }
    this.cancelledSessionIds.add(session.sessionId)
    if (this.activeInsertionSession?.sessionId === session.sessionId) {
      this.activeInsertionSession.insertion.cancel()
      this.activeInsertionSession = null
    }
    await this.flushPartial(session.sessionId).catch(() => undefined)
    await this.client.mutation(api.sessions.cancel, {
      sessionId: session.sessionId,
      finishedAt: new Date().toISOString(),
    })
  }

  async showShortPressHint(): Promise<void> {
    await this.showNotice('notices.doubleTapToToggle', 'push-to-talk')
  }

  async submitAudio(mode: ActivationMode, payload: DictationAudioPayload): Promise<void> {
    const initialSession = this.getSession()
    if (
      !initialSession ||
      !['listening', 'processing'].includes(initialSession.status) ||
      initialSession.activationMode !== mode ||
      this.submittingSessionId === initialSession.sessionId
    ) {
      return
    }

    const sessionId = initialSession.sessionId
    this.submittingSessionId = sessionId
    this.cancelledSessionIds.delete(sessionId)
    this.resetPartialWriter()

    if (!payload.speechDetected || payload.durationMs < 1500) {
      this.submittingSessionId = null
      await this.showNotice('notices.noSpeechDetected', mode)
      return
    }

    let partialText = ''
    let processingSession = initialSession
    let firstTokenAt: string | null = null
    try {
      this.updateTimingMarks(sessionId, {
        submissionStartedAt: new Date().toISOString(),
      })
      const settings = this.getSettings()
      const contextCapture = this.contextCaptureBySessionId.get(sessionId)
      let context = contextCapture ? await contextCapture : initialSession.context

      if (
        mode === 'push-to-talk' &&
        settings.sendContextAutomatically &&
        !context.selectedText
      ) {
        const contextRefreshStartedAt = new Date().toISOString()
        const refreshed = await this.contextService.capture(true, true)
        this.updateTimingMarks(sessionId, {
          contextRefreshStartedAt,
          contextRefreshCompletedAt: new Date().toISOString(),
        })
        context = {
          ...context,
          selectedText: refreshed.selectedText,
          confidence: refreshed.selectedText
            ? refreshed.confidence
            : context.confidence,
        }
      }

      const insertionPlan = this.insertionEngine.createPlan(context)
      processingSession = await this.client.mutation(api.sessions.markProcessing, {
        sessionId,
        processingStartedAt: new Date().toISOString(),
        targetApp: context.appName,
        context,
        insertionPlan,
      })

      const insertion = this.insertionEngine.createProgressiveSession(
        settings.insertionStreamingMode,
      )
      await insertion.warmup()
      this.activeInsertionSession = { sessionId, insertion }

      const response = await this.llm.stream(
        {
          audioBase64: payload.audioBase64,
          audioMimeType: payload.mimeType,
          languageHint: payload.languageHint,
          context,
          modelId: settings.modelId,
        },
        async (delta) => {
          if (this.cancelledSessionIds.has(sessionId)) {
            return
          }
          firstTokenAt ??= new Date().toISOString()
          partialText += delta
          this.queuePartial(sessionId, partialText)
          await insertion.append(delta)
        },
      )

      await this.flushPartial(sessionId)
      if (this.cancelledSessionIds.has(sessionId)) {
        return
      }
      if (!response.text.trim()) {
        await insertion.finalize('')
        await this.showNotice('notices.noFinalText', mode)
        return
      }

      const execution = await insertion.finalize(response.text)
      if (this.cancelledSessionIds.has(sessionId)) {
        return
      }
      const finishedAt = new Date().toISOString()
      const audit = createSessionAudit({
        session: processingSession,
        settings,
        audio: payload,
        response,
        execution,
        firstTokenAt,
        marks: this.timingMarksBySessionId.get(sessionId),
        finishedAt,
      })
      await this.client.mutation(api.sessions.complete, {
        sessionId,
        finishedAt,
        finalText: response.text,
        partialText: response.text,
        audit,
      })
      await this.client
        .mutation(api.history.appendWithAudio, {
          sessionId,
          audioBase64: payload.audioBase64,
          mimeType: payload.mimeType,
          durationMs: payload.durationMs,
        })
        .catch(() => undefined)
    } catch (error) {
      if (this.cancelledSessionIds.has(sessionId)) {
        return
      }
      await this.flushPartial(sessionId).catch(() => undefined)
      const message = error instanceof Error ? error.message : 'Unknown dictation error'
      const execution = this.getFailureExecution(this.getSettings(), sessionId)
      if (partialText) {
        await this.insertionEngine
          .createProgressiveSession('all-at-once')
          .recoverToClipboard(partialText)
      }
      const finishedAt = new Date().toISOString()
      const settings = this.getSettings()
      const audit = createSessionAudit({
        session: processingSession,
        settings,
        audio: payload,
        response: null,
        execution,
        firstTokenAt,
        marks: this.timingMarksBySessionId.get(sessionId),
        finishedAt,
      })
      await this.client.mutation(api.sessions.fail, {
        sessionId,
        finishedAt,
        errorMessage: partialText
          ? `${message} Latest text copied to clipboard.`
          : message,
        partialText,
        audit,
      })
      await this.client.mutation(api.history.appendWithAudio, {
        sessionId,
        audioBase64: payload.audioBase64,
        mimeType: payload.mimeType,
        durationMs: payload.durationMs,
      })
    } finally {
      this.contextCaptureBySessionId.delete(sessionId)
      this.timingMarksBySessionId.delete(sessionId)
      if (this.activeInsertionSession?.sessionId === sessionId) {
        this.activeInsertionSession = null
      }
      this.cancelledSessionIds.delete(sessionId)
      if (this.submittingSessionId === sessionId) {
        this.submittingSessionId = null
      }
      this.resetPartialWriter()
    }
  }

  private getFailureExecution(
    settings: Settings,
    sessionId: string,
  ): InsertionExecutionReport {
    return this.activeInsertionSession?.sessionId === sessionId
      ? this.activeInsertionSession.insertion.getExecutionReport()
      : {
          requestedMode: settings.insertionStreamingMode,
          effectiveMode: settings.insertionStreamingMode,
          insertionMethod: 'clipboard-all-at-once',
          fallbackUsed: false,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          writtenCharacterCount: null,
        }
  }

  private queuePartial(sessionId: string, text: string): void {
    this.pendingPartial = { sessionId, text }
    if (this.partialFlushTimer) {
      return
    }
    this.partialFlushTimer = setTimeout(() => {
      this.partialFlushTimer = null
      this.enqueuePendingPartial()
    }, 40)
  }

  private enqueuePendingPartial(): void {
    const pending = this.pendingPartial
    this.pendingPartial = null
    if (!pending) {
      return
    }
    this.partialWriteChain = this.partialWriteChain
      .then(async () => {
        await this.client.mutation(api.sessions.appendPartial, {
          sessionId: pending.sessionId,
          partialText: pending.text,
        })
      })
      .catch((error: unknown) => {
        this.partialWriteError =
          error instanceof Error ? error : new Error('Partial text persistence failed.')
      })
  }

  private async flushPartial(sessionId: string): Promise<void> {
    if (this.partialFlushTimer) {
      clearTimeout(this.partialFlushTimer)
      this.partialFlushTimer = null
    }
    if (this.pendingPartial?.sessionId === sessionId) {
      this.enqueuePendingPartial()
    }
    await this.partialWriteChain
    if (this.partialWriteError) {
      throw this.partialWriteError
    }
  }

  private resetPartialWriter(): void {
    if (this.partialFlushTimer) {
      clearTimeout(this.partialFlushTimer)
    }
    this.partialFlushTimer = null
    this.pendingPartial = null
    this.partialWriteChain = Promise.resolve()
    this.partialWriteError = null
  }

  private updateTimingMarks(sessionId: string, patch: HistoryTimingMarks): void {
    this.timingMarksBySessionId.set(sessionId, {
      ...this.timingMarksBySessionId.get(sessionId),
      ...patch,
    })
  }

  async showNotice(message: string, mode: ActivationMode = 'toggle'): Promise<void> {
    const current = this.getSession()
    const settings = this.getSettings()
    const now = new Date().toISOString()
    await this.client.mutation(api.sessions.notice, {
      sessionId: current?.sessionId ?? createId('session'),
      activationMode: current?.activationMode ?? mode,
      startedAt: current?.startedAt ?? now,
      finishedAt: now,
      targetApp: current?.targetApp ?? 'Ditado',
      context: current?.context ?? emptyContextSnapshot,
      insertionPlan: current?.insertionPlan ?? defaultInsertionPlan,
      noticeMessage: message,
      modelId: settings.modelId,
      requestedMode: settings.insertionStreamingMode,
    })
  }
}
