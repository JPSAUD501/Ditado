import type { AppStore } from '../store/appStore.js'
import type { DictationAudioPayload, DictationSession, LlmResponse } from '../../../shared/contracts.js'

export class HistoryService {
  constructor(private readonly store: AppStore) {}

  async appendCompletedSession(session: DictationSession, response: LlmResponse, audio: DictationAudioPayload): Promise<void> {
    const audioHistory = await this.store.persistHistoryAudio(session.id, audio)
    await this.store.appendHistory({
      id: session.id,
      createdAt: session.finishedAt ?? new Date().toISOString(),
      appName: session.context.appName,
      windowTitle: session.context.windowTitle,
      activationMode: session.activationMode,
      modelId: this.store.getSettings().modelId,
      outputText: response.text,
      ...audioHistory,
      submittedContext: {
        ...session.context,
      },
      usedContext: Boolean(session.context.selectedText),
      latencyMs: response.latencyMs,
      insertionStrategy: session.insertionPlan.strategy,
    })
  }
}
