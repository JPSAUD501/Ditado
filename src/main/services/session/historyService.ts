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
    const audioHistory = await this.store.persistHistoryAudio(session.id, audio)
    await this.store.appendHistory({
      id: session.id,
      createdAt: session.finishedAt ?? new Date().toISOString(),
      outcome: 'completed',
      appName: session.context.appName,
      windowTitle: session.context.windowTitle,
      activationMode: session.activationMode,
      modelId: this.store.getSettings().modelId,
      outputText: response.text,
      errorMessage: null,
      ...audioHistory,
      submittedContext: {
        ...session.context,
      },
      usedContext: Boolean(session.context.selectedText),
      latencyMs: response.latencyMs,
      insertionStrategy: session.insertionPlan.strategy,
      insertionMethod: execution.insertionMethod,
      fallbackUsed: execution.fallbackUsed,
    })
  }

  async appendFailedSession(
    session: DictationSession,
    audio: DictationAudioPayload,
    execution?: InsertionExecutionReport,
  ): Promise<void> {
    const audioHistory = await this.store.persistHistoryAudio(session.id, audio)
    await this.store.appendHistory({
      id: session.id,
      createdAt: session.finishedAt ?? new Date().toISOString(),
      outcome: 'error',
      appName: session.context.appName,
      windowTitle: session.context.windowTitle,
      activationMode: session.activationMode,
      modelId: this.store.getSettings().modelId,
      outputText: session.partialText || session.finalText || '',
      errorMessage: session.errorMessage,
      ...audioHistory,
      submittedContext: {
        ...session.context,
      },
      usedContext: Boolean(session.context.selectedText),
      latencyMs: 0,
      insertionStrategy: session.insertionPlan.strategy,
      insertionMethod: execution?.insertionMethod ?? 'clipboard-protected',
      fallbackUsed: execution?.fallbackUsed ?? false,
    })
  }
}
