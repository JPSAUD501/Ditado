import { z } from 'zod'

export const dictationStatusSchema = z.enum([
  'idle',
  'arming',
  'listening',
  'processing',
  'streaming',
  'completed',
  'notice',
  'error',
  'permission-required',
])

export type DictationStatus = z.infer<typeof dictationStatusSchema>

export const activationModeSchema = z.enum(['push-to-talk', 'toggle'])

export type ActivationMode = z.infer<typeof activationModeSchema>

export const insertionStrategySchema = z.enum(['replace-selection', 'insert-at-cursor'])

export type InsertionStrategy = z.infer<typeof insertionStrategySchema>

export const insertionStreamingModeSchema = z.enum([
  'letter-by-letter',
  'all-at-once',
])

export type InsertionStreamingMode = z.infer<typeof insertionStreamingModeSchema>

export const insertionMethodSchema = z.enum([
  'enigo-letter',
  'clipboard-all-at-once',
])

export type InsertionMethod = z.infer<typeof insertionMethodSchema>

export const contextSnapshotSchema = z.object({
  appName: z.string(),
  windowTitle: z.string().nullable(),
  selectedText: z.string().default(''),
  permissionsGranted: z.boolean().default(false),
  confidence: z.enum(['high', 'partial', 'low']).default('low'),
  capturedAt: z.string(),
})

export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>

export const insertionPlanSchema = z.object({
  strategy: insertionStrategySchema,
  targetApp: z.string(),
  capability: z.enum(['automation', 'clipboard']),
})

export type InsertionPlan = z.infer<typeof insertionPlanSchema>

export const dictationSessionSchema = z.object({
  id: z.string(),
  activationMode: activationModeSchema,
  status: dictationStatusSchema,
  captureIntent: z.enum(['none', 'start', 'stop']).default('none'),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  processingStartedAt: z.string().nullable().default(null),
  targetApp: z.string(),
  context: contextSnapshotSchema,
  partialText: z.string().default(''),
  finalText: z.string().default(''),
  insertionPlan: insertionPlanSchema,
  errorMessage: z.string().nullable().default(null),
  noticeMessage: z.string().nullable().default(null),
})

export type DictationSession = z.infer<typeof dictationSessionSchema>

const nullableNumberSchema = z.number().nonnegative().nullable().default(null)
const nullableIntSchema = z.number().int().nonnegative().nullable().default(null)
const nullableOffsetSchema = z.number().int().nonnegative().nullable().default(null)

export const historySessionTimingSchema = z.object({
  sessionStartedMs: nullableOffsetSchema,
  contextPreviewStartedMs: nullableOffsetSchema,
  contextPreviewCompletedMs: nullableOffsetSchema,
  contextRefreshStartedMs: nullableOffsetSchema,
  contextRefreshCompletedMs: nullableOffsetSchema,
  submissionStartedMs: nullableOffsetSchema,
  stopRequestedMs: nullableOffsetSchema,
  microphoneRequestStartedMs: nullableOffsetSchema,
  microphoneRequestCompletedMs: nullableOffsetSchema,
  recordingStartedMs: nullableOffsetSchema,
  recordingEndedMs: nullableOffsetSchema,
  recorderStopStartedMs: nullableOffsetSchema,
  mediaRecorderStopCompletedMs: nullableOffsetSchema,
  audioPreparationStartedMs: nullableOffsetSchema,
  audioPreparationEndedMs: nullableOffsetSchema,
  processingStartedMs: nullableOffsetSchema,
  llmRequestStartedMs: nullableOffsetSchema,
  llmResponseHeadersMs: nullableOffsetSchema,
  firstTokenMs: nullableOffsetSchema,
  llmCompletedMs: nullableOffsetSchema,
  insertionStartedMs: nullableOffsetSchema,
  insertionCompletedMs: nullableOffsetSchema,
  sessionFinishedMs: nullableOffsetSchema,
})

export type HistorySessionTiming = z.infer<typeof historySessionTimingSchema>

export const historySessionDurationsSchema = z.object({
  contextPreviewMs: nullableNumberSchema,
  contextRefreshMs: nullableNumberSchema,
  microphoneRequestMs: nullableNumberSchema,
  recordingMs: nullableNumberSchema,
  recorderStopMs: nullableNumberSchema,
  audioPreparationMs: nullableNumberSchema,
  networkHandshakeMs: nullableNumberSchema,
  modelUntilFirstTokenMs: nullableNumberSchema,
  modelStreamingMs: nullableNumberSchema,
  llmTotalMs: nullableNumberSchema,
  insertionMs: nullableNumberSchema,
  totalSessionMs: nullableNumberSchema,
})

export type HistorySessionDurations = z.infer<typeof historySessionDurationsSchema>

export const historyAudioMetadataSchema = z.object({
  filePath: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative().default(0),
  mimeType: z.string().nullable().default(null),
  bytes: z.number().int().nonnegative().default(0),
  speechDetected: z.boolean().default(false),
  peakAmplitude: z.number().nonnegative().default(0),
  rmsAmplitude: z.number().nonnegative().default(0),
  languageHint: z.string().nullable().default(null),
  stopReason: z.enum(['user-stop', 'max-duration', 'cancelled', 'unknown']).default('unknown'),
  maxDurationReached: z.boolean().default(false),
})

export type HistoryAudioMetadata = z.infer<typeof historyAudioMetadataSchema>

export const historyLlmMetadataSchema = z.object({
  provider: z.string().default('openrouter'),
  modelId: z.string(),
  finishReason: z.string().nullable().default(null),
  usedContext: z.boolean().default(false),
})

export type HistoryLlmMetadata = z.infer<typeof historyLlmMetadataSchema>

export const historyInsertionMetadataSchema = z.object({
  strategy: insertionStrategySchema,
  requestedMode: insertionStreamingModeSchema,
  effectiveMode: insertionStreamingModeSchema,
  method: insertionMethodSchema.default('clipboard-all-at-once'),
  fallbackUsed: z.boolean().default(false),
  targetApp: z.string(),
  writtenCharacterCount: nullableIntSchema,
})

export type HistoryInsertionMetadata = z.infer<typeof historyInsertionMetadataSchema>

export const historyContextMetadataSchema = contextSnapshotSchema.nullable().default(null)

export type HistoryContextMetadata = z.infer<typeof historyContextMetadataSchema>

export const historyOutcomeMetadataSchema = z.object({
  status: z.enum(['completed', 'error', 'notice', 'cancelled', 'permission-required']).default('completed'),
  errorMessage: z.string().nullable().default(null),
  noticeMessage: z.string().nullable().default(null),
})

export type HistoryOutcomeMetadata = z.infer<typeof historyOutcomeMetadataSchema>

export const historyTextMetadataSchema = z.object({
  finalText: z.string().default(''),
  partialText: z.string().default(''),
})

export type HistoryTextMetadata = z.infer<typeof historyTextMetadataSchema>

const historyEntryBaseSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  outcome: z.enum(['completed', 'error']).default('completed'),
  appName: z.string(),
  windowTitle: z.string().nullable().default(null),
  activationMode: activationModeSchema,
  modelId: z.string(),
  outputText: z.string(),
  errorMessage: z.string().nullable().default(null),
  audioFilePath: z.string().nullable().default(null),
  audioDurationMs: z.number().int().nonnegative().default(0),
  audioMimeType: z.string().nullable().default(null),
  audioBytes: z.number().int().nonnegative().default(0),
  submittedContext: contextSnapshotSchema.nullable().default(null),
  usedContext: z.boolean(),
  latencyMs: z.number().nonnegative().default(0),
  audioProcessingMs: z.number().nonnegative().default(0),
  audioSendMs: z.number().nonnegative().default(0),
  timeToFirstTokenMs: z.number().nonnegative().default(0),
  timeToCompleteMs: z.number().nonnegative().default(0),
  insertionStrategy: insertionStrategySchema,
  requestedMode: insertionStreamingModeSchema,
  effectiveMode: insertionStreamingModeSchema,
  insertionMethod: insertionMethodSchema.default('clipboard-all-at-once'),
  fallbackUsed: z.boolean().default(false),
})

const normalizedHistoryEntrySchema = historyEntryBaseSchema.extend({
  timing: historySessionTimingSchema,
  durations: historySessionDurationsSchema,
  audio: historyAudioMetadataSchema,
  llm: historyLlmMetadataSchema,
  insertion: historyInsertionMetadataSchema,
  context: historyContextMetadataSchema,
  outcomeDetail: historyOutcomeMetadataSchema,
  text: historyTextMetadataSchema,
})

const legacyHistoryEntrySchema = historyEntryBaseSchema

const safeDiffMs = (start: number | null, end: number | null): number | null => {
  if (!start || !end) {
    return null
  }
  const diff = end - start
  if (!Number.isFinite(diff)) {
    return null
  }
  return Math.max(0, Math.round(diff))
}

const deriveNormalizedHistoryEntry = (entry: z.infer<typeof historyEntryBaseSchema>) => {
  const timing: HistorySessionTiming = {
    sessionStartedMs: 0,
    contextPreviewStartedMs: null,
    contextPreviewCompletedMs: null,
    contextRefreshStartedMs: null,
    contextRefreshCompletedMs: null,
    submissionStartedMs: null,
    stopRequestedMs: null,
    microphoneRequestStartedMs: null,
    microphoneRequestCompletedMs: null,
    recordingStartedMs: null,
    recordingEndedMs: null,
    recorderStopStartedMs: null,
    mediaRecorderStopCompletedMs: null,
    audioPreparationStartedMs: null,
    audioPreparationEndedMs: null,
    processingStartedMs: null,
    llmRequestStartedMs: null,
    llmResponseHeadersMs: null,
    firstTokenMs: null,
    llmCompletedMs: null,
    insertionStartedMs: null,
    insertionCompletedMs: null,
    sessionFinishedMs: null,
  }

  const durations: HistorySessionDurations = {
    contextPreviewMs: null,
    contextRefreshMs: null,
    microphoneRequestMs: null,
    recordingMs: entry.audioDurationMs > 0 ? entry.audioDurationMs : null,
    recorderStopMs: null,
    audioPreparationMs: entry.audioProcessingMs > 0 ? entry.audioProcessingMs : null,
    networkHandshakeMs: entry.audioSendMs > 0 ? entry.audioSendMs : null,
    modelUntilFirstTokenMs: entry.timeToFirstTokenMs > 0 ? entry.timeToFirstTokenMs : null,
    modelStreamingMs: null,
    llmTotalMs: entry.latencyMs > 0 ? entry.latencyMs : null,
    insertionMs: null,
    totalSessionMs: null,
  }

  return normalizedHistoryEntrySchema.parse({
    ...entry,
    timing,
    durations,
    audio: {
      filePath: entry.audioFilePath,
      durationMs: entry.audioDurationMs,
      mimeType: entry.audioMimeType,
      bytes: entry.audioBytes,
      speechDetected: entry.audioDurationMs > 0,
      peakAmplitude: 0,
      rmsAmplitude: 0,
      languageHint: null,
      stopReason: 'unknown',
      maxDurationReached: false,
    },
    llm: {
      provider: 'openrouter',
      modelId: entry.modelId,
      finishReason: null,
      usedContext: entry.usedContext,
    },
    insertion: {
      strategy: entry.insertionStrategy,
      requestedMode: entry.requestedMode,
      effectiveMode: entry.effectiveMode,
      method: entry.insertionMethod,
      fallbackUsed: entry.fallbackUsed,
      targetApp: entry.appName,
      writtenCharacterCount: entry.outputText.length || null,
    },
    context: entry.submittedContext,
    outcomeDetail: {
      status: entry.outcome,
      errorMessage: entry.errorMessage,
      noticeMessage: null,
    },
    text: {
      finalText: entry.outputText,
      partialText: '',
    },
  })
}

export const historyEntrySchema = z.union([normalizedHistoryEntrySchema, legacyHistoryEntrySchema]).transform((entry) => {
  if ('timing' in entry && 'durations' in entry && 'audio' in entry) {
    return normalizedHistoryEntrySchema.parse({
      ...entry,
      appName: entry.context?.appName ?? entry.appName,
      windowTitle: entry.context?.windowTitle ?? entry.windowTitle,
      modelId: entry.llm.modelId,
      outputText: entry.text.finalText || entry.text.partialText || entry.outputText,
      errorMessage: entry.outcomeDetail.errorMessage,
      audioFilePath: entry.audio.filePath,
      audioDurationMs: entry.audio.durationMs,
      audioMimeType: entry.audio.mimeType,
      audioBytes: entry.audio.bytes,
      submittedContext: entry.context,
      usedContext: entry.llm.usedContext,
      latencyMs: entry.durations.llmTotalMs ?? 0,
      audioProcessingMs: entry.durations.audioPreparationMs ?? 0,
      audioSendMs: entry.durations.networkHandshakeMs ?? 0,
      timeToFirstTokenMs: entry.durations.modelUntilFirstTokenMs ?? 0,
      timeToCompleteMs:
        entry.durations.llmTotalMs !== null && entry.durations.insertionMs !== null
          ? entry.durations.llmTotalMs + entry.durations.insertionMs
          : entry.timeToCompleteMs,
      insertionStrategy: entry.insertion.strategy,
      requestedMode: entry.insertion.requestedMode,
      effectiveMode: entry.insertion.effectiveMode,
      insertionMethod: entry.insertion.method,
      fallbackUsed: entry.insertion.fallbackUsed,
      outcome: entry.outcome,
    })
  }

  return deriveNormalizedHistoryEntry(entry)
})

export type HistoryEntry = z.infer<typeof historyEntrySchema>

export const telemetryRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  kind: z.enum(['metric', 'error']),
  name: z.string(),
  detail: z.record(z.string(), z.string()).default({}),
})

export type TelemetryRecord = z.infer<typeof telemetryRecordSchema>

export const settingsSchema = z.object({
  launchOnLogin: z.boolean().default(true),
  pushToTalkHotkey: z.string().default('Ctrl+Alt'),
  toggleHotkey: z.string().default('Shift+Alt'),
  preferredMicrophoneId: z.string().nullable().default(null),
  sendContextAutomatically: z.boolean().default(true),
  telemetryEnabled: z.boolean().default(true),
  autoUpdateEnabled: z.boolean().default(true),
  updateChannel: z.enum(['stable', 'beta']).default('stable'),
  insertionStreamingMode: insertionStreamingModeSchema.default('letter-by-letter'),
  historyRetentionDays: z.number().int().positive().default(365),
  maxHistoryAudioBytes: z.number().int().positive().default(512 * 1024 * 1024),
  modelId: z.string().default('google/gemini-3-flash-preview'),
  apiKeyPresent: z.boolean().default(false),
  onboardingCompleted: z.boolean().default(false),
  theme: z.enum(['dark', 'light', 'system']).default('system'),
  language: z.enum(['en', 'pt-BR', 'es', 'system']).default('system'),
})

export type Settings = z.infer<typeof settingsSchema>

export const settingsPatchSchema = z.object({
  launchOnLogin: z.boolean().optional(),
  pushToTalkHotkey: z.string().optional(),
  toggleHotkey: z.string().optional(),
  preferredMicrophoneId: z.string().nullable().optional(),
  sendContextAutomatically: z.boolean().optional(),
  telemetryEnabled: z.boolean().optional(),
  autoUpdateEnabled: z.boolean().optional(),
  updateChannel: z.enum(['stable', 'beta']).optional(),
  insertionStreamingMode: insertionStreamingModeSchema.optional(),
  historyRetentionDays: z.number().int().positive().optional(),
  maxHistoryAudioBytes: z.number().int().positive().optional(),
  modelId: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  language: z.enum(['en', 'pt-BR', 'es', 'system']).optional(),
})
  .strict()

export type SettingsPatch = z.infer<typeof settingsPatchSchema>

export const llmRequestSchema = z.object({
  audioBase64: z.string(),
  audioMimeType: z.string(),
  languageHint: z.string().nullable(),
  context: contextSnapshotSchema,
  modelId: z.string(),
})

export type LlmRequest = z.infer<typeof llmRequestSchema>

export const llmResponseSchema = z.object({
  text: z.string(),
  latencyMs: z.number().nonnegative(),
  audioSendMs: z.number().nonnegative().default(0),
  finishReason: z.string().nullable(),
  provider: z.string().default('openrouter'),
  requestStartedAt: z.string().nullable().default(null),
  responseHeadersAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
})

export type LlmResponse = z.input<typeof llmResponseSchema>

export const deviceInfoSchema = z.object({
  deviceId: z.string(),
  label: z.string(),
  kind: z.literal('audioinput'),
})

export type DeviceInfo = z.infer<typeof deviceInfoSchema>

export const recorderWarmupStatusSchema = z.enum(['warmed', 'skipped', 'failed'])

export type RecorderWarmupStatus = z.infer<typeof recorderWarmupStatusSchema>

export const historyAudioAssetSchema = z.object({
  mimeType: z.string(),
  base64: z.string(),
})

export type HistoryAudioAsset = z.infer<typeof historyAudioAssetSchema>

export const insertionBenchmarkResultSchema = z.object({
  mode: insertionStreamingModeSchema,
  effectiveMode: insertionStreamingModeSchema,
  targetApp: z.string(),
  graphemeCount: z.number().int().positive(),
  durationMs: z.number().nonnegative(),
  charactersPerSecond: z.number().nonnegative(),
  sampleText: z.string(),
  insertionMethod: insertionMethodSchema,
  fallbackUsed: z.boolean().default(false),
})

export type InsertionBenchmarkResult = z.infer<typeof insertionBenchmarkResultSchema>

export const insertionBenchmarkRequestSchema = z.object({
  mode: insertionStreamingModeSchema,
  text: z.string().trim().min(1).max(2_000),
})

export type InsertionBenchmarkRequest = z.infer<typeof insertionBenchmarkRequestSchema>

export const updateStateSchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(['stable', 'beta']),
  lastCheckedAt: z.string().nullable(),
  status: z.enum(['idle', 'checking', 'available', 'downloading', 'downloaded', 'installing', 'disabled', 'error', 'unsupported']),
  downloadProgress: z.number().nullable(),
})

export type UpdateState = z.infer<typeof updateStateSchema>

export const dashboardTabSchema = z.enum(['overview', 'settings', 'history', 'onboarding'])

export type DashboardTab = z.infer<typeof dashboardTabSchema>

export const permissionStateSchema = z.object({
  microphone: z.enum(['granted', 'denied', 'not-determined', 'restricted', 'unknown']),
  accessibility: z.enum(['granted', 'denied', 'not-determined', 'unknown']),
})

export type PermissionState = z.infer<typeof permissionStateSchema>

export const overlayViewModelSchema = z.object({
  session: dictationSessionSchema.nullable(),
  settings: settingsSchema,
  permissions: permissionStateSchema,
})

export type OverlayViewModel = z.infer<typeof overlayViewModelSchema>

export const dashboardViewModelSchema = z.object({
  session: dictationSessionSchema.nullable(),
  settings: settingsSchema,
  history: z.array(historyEntrySchema),
  telemetryTail: z.array(telemetryRecordSchema),
  permissions: permissionStateSchema,
  updateState: updateStateSchema,
  appVersion: z.string(),
})

export type DashboardViewModel = z.infer<typeof dashboardViewModelSchema>

export type WindowKind = 'overlay' | 'dashboard'

export const dictationAudioPayloadSchema = z.object({
  audioBase64: z.string(),
  mimeType: z.string(),
  languageHint: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  audioProcessingMs: z.number().nonnegative().default(0),
  speechDetected: z.boolean(),
  peakAmplitude: z.number().nonnegative(),
  rmsAmplitude: z.number().nonnegative(),
  microphoneRequestStartedAt: z.string().nullable().default(null),
  microphoneRequestCompletedAt: z.string().nullable().default(null),
  recordingStartedAt: z.string().nullable().default(null),
  recordingEndedAt: z.string().nullable().default(null),
  recorderStopStartedAt: z.string().nullable().default(null),
  mediaRecorderStopCompletedAt: z.string().nullable().default(null),
  audioPreparationStartedAt: z.string().nullable().default(null),
  audioPreparationEndedAt: z.string().nullable().default(null),
  stopReason: z.enum(['user-stop', 'max-duration', 'cancelled', 'unknown']).default('unknown'),
  maxDurationReached: z.boolean().default(false),
})

export type DictationAudioPayload = z.input<typeof dictationAudioPayloadSchema>

export const apiKeyInputSchema = z.string().trim().max(4096)
export const historyAudioRequestSchema = z.string().min(1)
export const sessionIdInputSchema = z.string().min(1)

export const deriveHistoryDurations = (timing: HistorySessionTiming): HistorySessionDurations => {
  const contextPreviewMs = safeDiffMs(timing.contextPreviewStartedMs, timing.contextPreviewCompletedMs)
  const contextRefreshMs = safeDiffMs(timing.contextRefreshStartedMs, timing.contextRefreshCompletedMs)
  const microphoneRequestMs = safeDiffMs(timing.microphoneRequestStartedMs, timing.microphoneRequestCompletedMs)
  const recordingMs = safeDiffMs(timing.recordingStartedMs, timing.recordingEndedMs)
  const recorderStopMs = safeDiffMs(timing.recorderStopStartedMs, timing.mediaRecorderStopCompletedMs)
  const audioPreparationMs = safeDiffMs(timing.audioPreparationStartedMs, timing.audioPreparationEndedMs)
  const networkHandshakeMs = safeDiffMs(timing.llmRequestStartedMs, timing.llmResponseHeadersMs)
  const modelUntilFirstTokenMs = safeDiffMs(timing.llmResponseHeadersMs, timing.firstTokenMs)
  const llmTotalMs = safeDiffMs(timing.llmRequestStartedMs, timing.llmCompletedMs)
  const insertionMs = safeDiffMs(timing.insertionStartedMs, timing.insertionCompletedMs)
  const totalSessionMs = safeDiffMs(timing.sessionStartedMs, timing.sessionFinishedMs)
  const modelStreamingMs =
    llmTotalMs !== null && networkHandshakeMs !== null && modelUntilFirstTokenMs !== null
      ? Math.max(0, llmTotalMs - networkHandshakeMs - modelUntilFirstTokenMs)
      : safeDiffMs(timing.firstTokenMs, timing.llmCompletedMs)

  return {
    contextPreviewMs,
    contextRefreshMs,
    microphoneRequestMs,
    recordingMs,
    recorderStopMs,
    audioPreparationMs,
    networkHandshakeMs,
    modelUntilFirstTokenMs,
    modelStreamingMs,
    llmTotalMs,
    insertionMs,
    totalSessionMs,
  }
}
