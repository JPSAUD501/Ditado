import type { InsertionExecutionReport } from '../insertion/insertionEngine.js'
import type { AppStore } from '../store/appStore.js'
import type { DictationAudioPayload, DictationSession, LlmResponse } from '../../../shared/contracts.js'

export class HistoryService {
  constructor(private readonly store: AppStore) {}

  async appendCompletedSession(
    session: DictationSession,
    response: LlmResponse,
    audio: DictationAudioPayload,
    execution: InsertionExecutionReport,
  ): Promise<void> {
    await this.store.appendHistoryWithAudio({
      id: session.id,
      createdAt: session.finishedAt ?? new Date().toISOString(),
      outcome: 'completed',
      appName: session.context.appName,
      windowTitle: session.context.windowTitle,
      activationMode: session.activationMode,
      modelId: this.store.getSettings().modelId,
      outputText: response.text,
      errorMessage: null,
      submittedContext: {
        ...session.context,
      },
      usedContext: Boolean(session.context.selectedText),
      latencyMs: response.latencyMs,
      insertionStrategy: session.insertionPlan.strategy,
      requestedMode: execution.requestedMode,
      effectiveMode: execution.effectiveMode,
      insertionMethod: execution.insertionMethod,
      fallbackUsed: execution.fallbackUsed,
    }, audio)
  }

  async appendFailedSession(
    session: DictationSession,
    audio: DictationAudioPayload,
    execution?: InsertionExecutionReport,
  ): Promise<void> {
    await this.store.appendHistoryWithAudio({
      id: session.id,
      createdAt: session.finishedAt ?? new Date().toISOString(),
      outcome: 'error',
      appName: session.context.appName,
      windowTitle: session.context.windowTitle,
      activationMode: session.activationMode,
      modelId: this.store.getSettings().modelId,
      outputText: session.partialText || session.finalText || '',
      errorMessage: session.errorMessage,
      submittedContext: {
        ...session.context,
      },
      usedContext: Boolean(session.context.selectedText),
      latencyMs: 0,
      insertionStrategy: session.insertionPlan.strategy,
      requestedMode: execution?.requestedMode ?? this.store.getSettings().insertionStreamingMode,
      effectiveMode: execution?.effectiveMode ?? this.store.getSettings().insertionStreamingMode,
      insertionMethod: execution?.insertionMethod ?? 'clipboard-all-at-once',
      fallbackUsed: execution?.fallbackUsed ?? false,
    }, audio)
  }
}
