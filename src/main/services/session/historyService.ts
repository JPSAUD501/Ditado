import type { InsertionExecutionReport } from '../insertion/insertionEngine.js'
import type { AppStore } from '../store/appStore.js'
import {
  deriveHistoryDurations,
  type DictationAudioPayload,
  type DictationSession,
  type HistoryEntry,
  type HistorySessionTiming,
  type LlmResponse,
} from '../../../shared/contracts.js'

export interface HistoryTimingMarks {
  contextPreviewStartedAt?: string | null
  contextPreviewCompletedAt?: string | null
  contextRefreshStartedAt?: string | null
  contextRefreshCompletedAt?: string | null
  submissionStartedAt?: string | null
  stopRequestedAt?: string | null
}

const toOffsetMs = (sessionStartedAt: string, timestamp: string | null | undefined): number | null => {
  if (!timestamp) {
    return null
  }

  const start = new Date(sessionStartedAt).getTime()
  const at = new Date(timestamp).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(at)) {
    return null
  }

  return Math.max(0, Math.round(at - start))
}

export class HistoryService {
  constructor(private readonly store: AppStore) {}

  async appendCompletedSession(
    session: DictationSession,
    response: LlmResponse,
    audio: DictationAudioPayload,
    execution: InsertionExecutionReport,
    timing?: { firstTokenAt: string | null; marks?: HistoryTimingMarks },
  ): Promise<void> {
    const historyEntry = this.createEntry({
      session,
      audio,
      response,
      execution,
      firstTokenAt: timing?.firstTokenAt ?? null,
      marks: timing?.marks,
      status: 'completed',
      errorMessage: null,
      noticeMessage: null,
      outputText: response.text,
      partialText: session.partialText,
    })

    await this.store.appendHistoryWithAudio(historyEntry, audio)
  }

  async appendFailedSession(
    session: DictationSession,
    audio: DictationAudioPayload,
    execution?: InsertionExecutionReport,
    marks?: HistoryTimingMarks,
  ): Promise<void> {
    const fallbackExecution: InsertionExecutionReport = execution ?? {
      requestedMode: this.store.getSettings().insertionStreamingMode,
      effectiveMode: this.store.getSettings().insertionStreamingMode,
      insertionMethod: 'clipboard-all-at-once',
      fallbackUsed: false,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      writtenCharacterCount: null,
    }

    const historyEntry = this.createEntry({
      session,
      audio,
      response: null,
      execution: fallbackExecution,
      firstTokenAt: null,
      marks,
      status: 'error',
      errorMessage: session.errorMessage,
      noticeMessage: session.noticeMessage,
      outputText: session.partialText || session.finalText || '',
      partialText: session.partialText,
    })

    await this.store.appendHistoryWithAudio(historyEntry, audio)
  }

  private createEntry({
    session,
    audio,
    response,
    execution,
    firstTokenAt,
    marks,
    status,
    errorMessage,
    noticeMessage,
    outputText,
    partialText,
  }: {
    session: DictationSession
    audio: DictationAudioPayload
    response: LlmResponse | null
    execution: InsertionExecutionReport
    firstTokenAt: string | null
    marks?: HistoryTimingMarks
    status: 'completed' | 'error'
    errorMessage: string | null
    noticeMessage: string | null
    outputText: string
    partialText: string
  }): Omit<HistoryEntry, 'audioFilePath' | 'audioDurationMs' | 'audioMimeType' | 'audioBytes'> {
    const sessionFinishedAt = session.finishedAt ?? new Date().toISOString()
    const createdAt = sessionFinishedAt
    const timing: HistorySessionTiming = {
      sessionStartedMs: 0,
      contextPreviewStartedMs: toOffsetMs(session.startedAt, marks?.contextPreviewStartedAt),
      contextPreviewCompletedMs: toOffsetMs(session.startedAt, marks?.contextPreviewCompletedAt),
      contextRefreshStartedMs: toOffsetMs(session.startedAt, marks?.contextRefreshStartedAt),
      contextRefreshCompletedMs: toOffsetMs(session.startedAt, marks?.contextRefreshCompletedAt),
      submissionStartedMs: toOffsetMs(session.startedAt, marks?.submissionStartedAt),
      stopRequestedMs: toOffsetMs(session.startedAt, marks?.stopRequestedAt),
      microphoneRequestStartedMs: toOffsetMs(session.startedAt, audio.microphoneRequestStartedAt),
      microphoneRequestCompletedMs: toOffsetMs(session.startedAt, audio.microphoneRequestCompletedAt),
      recordingStartedMs: toOffsetMs(session.startedAt, audio.recordingStartedAt),
      recordingEndedMs: toOffsetMs(session.startedAt, audio.recordingEndedAt),
      recorderStopStartedMs: toOffsetMs(session.startedAt, audio.recorderStopStartedAt),
      mediaRecorderStopCompletedMs: toOffsetMs(session.startedAt, audio.mediaRecorderStopCompletedAt),
      audioPreparationStartedMs: toOffsetMs(session.startedAt, audio.audioPreparationStartedAt),
      audioPreparationEndedMs: toOffsetMs(session.startedAt, audio.audioPreparationEndedAt),
      processingStartedMs: toOffsetMs(session.startedAt, session.processingStartedAt),
      llmRequestStartedMs: toOffsetMs(session.startedAt, response?.requestStartedAt),
      llmResponseHeadersMs: toOffsetMs(session.startedAt, response?.responseHeadersAt),
      firstTokenMs: toOffsetMs(session.startedAt, firstTokenAt),
      llmCompletedMs: toOffsetMs(session.startedAt, response?.completedAt),
      insertionStartedMs: toOffsetMs(session.startedAt, execution.startedAt),
      insertionCompletedMs: toOffsetMs(session.startedAt, execution.completedAt),
      sessionFinishedMs: toOffsetMs(session.startedAt, sessionFinishedAt),
    }
    const durations = deriveHistoryDurations(timing)
    const llmTotalMs = durations.llmTotalMs ?? response?.latencyMs ?? 0

    return {
      id: session.id,
      createdAt,
      outcome: status,
      appName: session.context.appName,
      windowTitle: session.context.windowTitle,
      activationMode: session.activationMode,
      modelId: this.store.getSettings().modelId,
      outputText,
      errorMessage,
      submittedContext: { ...session.context },
      usedContext: Boolean(session.context.selectedText),
      latencyMs: llmTotalMs,
      audioProcessingMs: durations.audioPreparationMs ?? audio.audioProcessingMs ?? 0,
      audioSendMs: durations.networkHandshakeMs ?? response?.audioSendMs ?? 0,
      timeToFirstTokenMs: durations.modelUntilFirstTokenMs ?? 0,
      timeToCompleteMs: durations.totalSessionMs ?? llmTotalMs,
      insertionStrategy: session.insertionPlan.strategy,
      requestedMode: execution.requestedMode,
      effectiveMode: execution.effectiveMode,
      insertionMethod: execution.insertionMethod,
      fallbackUsed: execution.fallbackUsed,
      timing,
      durations,
      audio: {
        filePath: null,
        durationMs: audio.durationMs ?? 0,
        mimeType: audio.mimeType ?? null,
        bytes: 0,
        speechDetected: audio.speechDetected ?? false,
        peakAmplitude: audio.peakAmplitude ?? 0,
        rmsAmplitude: audio.rmsAmplitude ?? 0,
        languageHint: audio.languageHint ?? null,
        stopReason: audio.stopReason ?? 'unknown',
        maxDurationReached: audio.maxDurationReached ?? false,
      },
      llm: {
        provider: response?.provider ?? 'openrouter',
        modelId: this.store.getSettings().modelId,
        finishReason: response?.finishReason ?? null,
        usedContext: Boolean(session.context.selectedText),
      },
      insertion: {
        strategy: session.insertionPlan.strategy,
        requestedMode: execution.requestedMode,
        effectiveMode: execution.effectiveMode,
        method: execution.insertionMethod,
        fallbackUsed: execution.fallbackUsed,
        targetApp: session.insertionPlan.targetApp,
        writtenCharacterCount: execution.writtenCharacterCount ?? null,
      },
      context: {
        ...session.context,
      },
      outcomeDetail: {
        status,
        errorMessage,
        noticeMessage,
      },
      text: {
        finalText: outputText,
        partialText,
      },
    }
  }
}
