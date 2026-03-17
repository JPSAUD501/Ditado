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

export const historyEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  outcome: z.enum(['completed', 'error']).default('completed'),
  appName: z.string(),
  windowTitle: z.string().nullable(),
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
  timeToFirstTokenMs: z.number().nonnegative().default(0),
  timeToCompleteMs: z.number().nonnegative().default(0),
  insertionStrategy: insertionStrategySchema,
  requestedMode: insertionStreamingModeSchema,
  effectiveMode: insertionStreamingModeSchema,
  insertionMethod: insertionMethodSchema.default('clipboard-all-at-once'),
  fallbackUsed: z.boolean().default(false),
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
  launchOnLogin: z.boolean().default(false),
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
  finishReason: z.string().nullable(),
})

export type LlmResponse = z.infer<typeof llmResponseSchema>

export const deviceInfoSchema = z.object({
  deviceId: z.string(),
  label: z.string(),
  kind: z.literal('audioinput'),
})

export type DeviceInfo = z.infer<typeof deviceInfoSchema>

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
  status: z.enum(['idle', 'checking', 'available', 'downloading', 'downloaded', 'disabled', 'error', 'unsupported']),
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
  wavBase64: z.string(),
  mimeType: z.string(),
  languageHint: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  speechDetected: z.boolean(),
  peakAmplitude: z.number().nonnegative(),
  rmsAmplitude: z.number().nonnegative(),
})

export type DictationAudioPayload = z.infer<typeof dictationAudioPayloadSchema>

export const apiKeyInputSchema = z.string().trim().max(4096)
export const historyAudioRequestSchema = z.string().min(1)
export const sessionIdInputSchema = z.string().min(1)
