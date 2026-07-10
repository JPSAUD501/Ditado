import { z } from 'zod'
import type { Doc, DocPatch } from '../../syncore/_generated/server.js'

type WithoutGeneratedFields<T> = Omit<T, '_id' | '_creationTime'>

export type SettingsDocument = Doc<'settings'>
export type StoredSettings = Omit<
  WithoutGeneratedFields<SettingsDocument>,
  'key' | 'updatedAt'
>
export type Settings = StoredSettings & { apiKeyPresent: boolean }
export type SettingsPatch = Omit<
  DocPatch<'settings'>,
  'key' | 'updatedAt'
>

export type DictationSession = Doc<'dictationSessions'>
export type HistoryEntry = Doc<'historyEntries'>
export type ActivationMode = DictationSession['activationMode']
export type DictationStatus = DictationSession['status'] | 'idle'
export type ContextSnapshot = DictationSession['context']
export type InsertionPlan = DictationSession['insertionPlan']
export type InsertionStrategy = InsertionPlan['strategy']
export type InsertionStreamingMode = DictationSession['insertion']['requestedMode']
export type InsertionMethod = DictationSession['insertion']['method']
export type HistorySessionTiming = DictationSession['timing']
export type HistorySessionDurations = {
  contextPreviewMs: number | null
  contextRefreshMs: number | null
  microphoneRequestMs: number | null
  recordingMs: number | null
  recorderStopMs: number | null
  audioPreparationMs: number | null
  networkHandshakeMs: number | null
  modelUntilFirstTokenMs: number | null
  modelStreamingMs: number | null
  llmTotalMs: number | null
  insertionMs: number | null
  totalSessionMs: number | null
}
const contextSnapshotSchema = z.object({
  appName: z.string(),
  windowTitle: z.string().nullable(),
  selectedText: z.string(),
  permissionsGranted: z.boolean(),
  confidence: z.enum(['high', 'partial', 'low']),
  capturedAt: z.string(),
})

const insertionStreamingModeSchema = z.enum([
  'letter-by-letter',
  'all-at-once',
])

const insertionMethodSchema = z.enum([
  'enigo-letter',
  'clipboard-all-at-once',
])

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
  status: z.enum([
    'idle',
    'checking',
    'available',
    'downloading',
    'downloaded',
    'installing',
    'disabled',
    'error',
    'unsupported',
  ]),
  downloadProgress: z.number().nullable(),
})

export type UpdateState = z.infer<typeof updateStateSchema>

export const dashboardTabSchema = z.enum([
  'overview',
  'settings',
  'history',
  'onboarding',
])
export type DashboardTab = z.infer<typeof dashboardTabSchema>

export const permissionStateSchema = z.object({
  microphone: z.enum([
    'granted',
    'denied',
    'not-determined',
    'restricted',
    'unknown',
  ]),
  accessibility: z.enum(['granted', 'denied', 'not-determined', 'unknown']),
})
export type PermissionState = z.infer<typeof permissionStateSchema>

export type DashboardNativeState = {
  permissions: PermissionState
  updateState: UpdateState
  appVersion: string
}

export type DashboardState = DashboardNativeState & {
  settings: Settings
  history: HistoryEntry[]
  session: DictationSession | null
}

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
  stopReason: z
    .enum(['user-stop', 'max-duration', 'cancelled', 'unknown'])
    .default('unknown'),
  maxDurationReached: z.boolean().default(false),
})

export type DictationAudioPayload = z.input<typeof dictationAudioPayloadSchema>

export const sessionIdInputSchema = z.string().min(1)

const safeDiffMs = (start: number | null, end: number | null): number | null => {
  if (start === null || end === null) {
    return null
  }
  const diff = end - start
  return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : null
}

export const deriveHistoryDurations = (
  timing: HistorySessionTiming,
): HistorySessionDurations => {
  const contextPreviewMs = safeDiffMs(
    timing.contextPreviewStartedMs,
    timing.contextPreviewCompletedMs,
  )
  const contextRefreshMs = safeDiffMs(
    timing.contextRefreshStartedMs,
    timing.contextRefreshCompletedMs,
  )
  const microphoneRequestMs = safeDiffMs(
    timing.microphoneRequestStartedMs,
    timing.microphoneRequestCompletedMs,
  )
  const recordingMs = safeDiffMs(timing.recordingStartedMs, timing.recordingEndedMs)
  const recorderStopMs = safeDiffMs(
    timing.recorderStopStartedMs,
    timing.mediaRecorderStopCompletedMs,
  )
  const audioPreparationMs = safeDiffMs(
    timing.audioPreparationStartedMs,
    timing.audioPreparationEndedMs,
  )
  const networkHandshakeMs = safeDiffMs(
    timing.llmRequestStartedMs,
    timing.llmResponseHeadersMs,
  )
  const modelUntilFirstTokenMs = safeDiffMs(
    timing.llmResponseHeadersMs,
    timing.firstTokenMs,
  )
  const llmTotalMs = safeDiffMs(timing.llmRequestStartedMs, timing.llmCompletedMs)
  const insertionMs = safeDiffMs(
    timing.insertionStartedMs,
    timing.insertionCompletedMs,
  )
  const totalSessionMs = safeDiffMs(
    timing.sessionStartedMs,
    timing.sessionFinishedMs,
  )
  const modelStreamingMs =
    llmTotalMs !== null &&
    networkHandshakeMs !== null &&
    modelUntilFirstTokenMs !== null
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
