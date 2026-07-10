import type {
  DictationAudioPayload,
  DictationSession,
  LlmResponse,
  Settings,
} from '../../../shared/contracts.js'
import type { InsertionExecutionReport } from '../insertion/insertionEngine.js'

export interface HistoryTimingMarks {
  contextPreviewStartedAt?: string | null
  contextPreviewCompletedAt?: string | null
  contextRefreshStartedAt?: string | null
  contextRefreshCompletedAt?: string | null
  submissionStartedAt?: string | null
  stopRequestedAt?: string | null
}

export type SessionAudit = Pick<
  DictationSession,
  'timing' | 'audio' | 'llm' | 'insertion'
>

const toOffsetMs = (
  sessionStartedAt: string,
  timestamp: string | null | undefined,
): number | null => {
  if (!timestamp) {
    return null
  }
  const start = Date.parse(sessionStartedAt)
  const at = Date.parse(timestamp)
  if (!Number.isFinite(start) || !Number.isFinite(at)) {
    return null
  }
  return Math.max(0, Math.round(at - start))
}

export const createSessionAudit = ({
  session,
  settings,
  audio,
  response,
  execution,
  firstTokenAt,
  marks,
  finishedAt,
}: {
  session: DictationSession
  settings: Settings
  audio: DictationAudioPayload
  response: LlmResponse | null
  execution: InsertionExecutionReport
  firstTokenAt: string | null
  marks?: HistoryTimingMarks
  finishedAt: string
}): SessionAudit => ({
  timing: {
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
    sessionFinishedMs: toOffsetMs(session.startedAt, finishedAt),
  },
  audio: {
    durationMs: audio.durationMs,
    mimeType: audio.mimeType,
    bytes: Buffer.from(audio.audioBase64, 'base64').byteLength,
    speechDetected: audio.speechDetected,
    peakAmplitude: audio.peakAmplitude,
    rmsAmplitude: audio.rmsAmplitude,
    languageHint: audio.languageHint,
    stopReason: audio.stopReason ?? 'unknown',
    maxDurationReached: audio.maxDurationReached ?? false,
  },
  llm: {
    provider: response?.provider ?? 'openrouter',
    modelId: settings.modelId,
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
})
