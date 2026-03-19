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

export class HistoryService {
  constructor(private readonly store: AppStore) {}

  async appendCompletedSession(
    session: DictationSession,
    response: LlmResponse,
    audio: DictationAudioPayload,
    execution: InsertionExecutionReport,
    timing?: { firstTokenAt: string | null },
  ): Promise<void> {
    const historyEntry = this.createEntry({
      session,
      audio,
      response,
      execution,
      firstTokenAt: timing?.firstTokenAt ?? null,
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
    status: 'completed' | 'error'
    errorMessage: string | null
    noticeMessage: string | null
    outputText: string
    partialText: string
  }): Omit<HistoryEntry, 'audioFilePath' | 'audioDurationMs' | 'audioMimeType' | 'audioBytes'> {
    const sessionFinishedAt = session.finishedAt ?? new Date().toISOString()
    const createdAt = sessionFinishedAt
    const timing: HistorySessionTiming = {
      sessionStartedAt: session.startedAt,
      recordingStartedAt: audio.recordingStartedAt ?? null,
      recordingEndedAt: audio.recordingEndedAt ?? null,
      audioPreparationStartedAt: audio.audioPreparationStartedAt ?? null,
      audioPreparationEndedAt: audio.audioPreparationEndedAt ?? null,
      processingStartedAt: session.processingStartedAt,
      llmRequestStartedAt: response?.requestStartedAt ?? null,
      llmResponseHeadersAt: response?.responseHeadersAt ?? null,
      firstTokenAt,
      llmCompletedAt: response?.completedAt ?? null,
      insertionStartedAt: execution.startedAt ?? null,
      insertionCompletedAt: execution.completedAt ?? null,
      sessionFinishedAt,
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
