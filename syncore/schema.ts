import { defineSchema, defineTable, s } from "syncorejs";

const nullableString = s.nullable(s.string());
const nullableNumber = s.nullable(s.number());

const contextSnapshot = s.object({
  appName: s.string(),
  windowTitle: nullableString,
  selectedText: s.string(),
  permissionsGranted: s.boolean(),
  confidence: s.enum(["high", "partial", "low"] as const),
  capturedAt: s.string()
});

const historyTiming = s.object({
  sessionStartedMs: nullableNumber,
  contextPreviewStartedMs: nullableNumber,
  contextPreviewCompletedMs: nullableNumber,
  contextRefreshStartedMs: nullableNumber,
  contextRefreshCompletedMs: nullableNumber,
  submissionStartedMs: nullableNumber,
  stopRequestedMs: nullableNumber,
  microphoneRequestStartedMs: nullableNumber,
  microphoneRequestCompletedMs: nullableNumber,
  recordingStartedMs: nullableNumber,
  recordingEndedMs: nullableNumber,
  recorderStopStartedMs: nullableNumber,
  mediaRecorderStopCompletedMs: nullableNumber,
  audioPreparationStartedMs: nullableNumber,
  audioPreparationEndedMs: nullableNumber,
  processingStartedMs: nullableNumber,
  llmRequestStartedMs: nullableNumber,
  llmResponseHeadersMs: nullableNumber,
  firstTokenMs: nullableNumber,
  llmCompletedMs: nullableNumber,
  insertionStartedMs: nullableNumber,
  insertionCompletedMs: nullableNumber,
  sessionFinishedMs: nullableNumber
});

const historyDurations = s.object({
  contextPreviewMs: nullableNumber,
  contextRefreshMs: nullableNumber,
  microphoneRequestMs: nullableNumber,
  recordingMs: nullableNumber,
  recorderStopMs: nullableNumber,
  audioPreparationMs: nullableNumber,
  networkHandshakeMs: nullableNumber,
  modelUntilFirstTokenMs: nullableNumber,
  modelStreamingMs: nullableNumber,
  llmTotalMs: nullableNumber,
  insertionMs: nullableNumber,
  totalSessionMs: nullableNumber
});

const audioMetadata = s.object({
  storageId: nullableString,
  durationMs: s.number(),
  mimeType: nullableString,
  bytes: s.number(),
  speechDetected: s.boolean(),
  peakAmplitude: s.number(),
  rmsAmplitude: s.number(),
  languageHint: nullableString,
  stopReason: s.enum(["user-stop", "max-duration", "cancelled", "unknown"] as const),
  maxDurationReached: s.boolean()
});

const insertionStreamingMode = s.enum(["letter-by-letter", "all-at-once"] as const);
const insertionMethod = s.enum(["enigo-letter", "clipboard-all-at-once"] as const);
const insertionStrategy = s.enum(["replace-selection", "insert-at-cursor"] as const);

export default defineSchema({
  appMetadata: defineTable({
    key: s.string(),
    value: s.string(),
    updatedAt: s.string()
  }).index("by_key", ["key"]),

  appSettings: defineTable({
    key: s.string(),
    launchOnLogin: s.boolean(),
    pushToTalkHotkey: s.string(),
    toggleHotkey: s.string(),
    preferredMicrophoneId: nullableString,
    sendContextAutomatically: s.boolean(),
    telemetryEnabled: s.boolean(),
    autoUpdateEnabled: s.boolean(),
    updateChannel: s.enum(["stable", "beta"] as const),
    insertionStreamingMode,
    historyRetentionDays: s.number(),
    maxHistoryAudioBytes: s.number(),
    modelId: s.string(),
    zeroDataRetention: s.optional(s.boolean()),
    onboardingCompleted: s.boolean(),
    theme: s.enum(["dark", "light", "system"] as const),
    language: s.enum(["en", "pt-BR", "es", "system"] as const),
    lastSeenAppVersion: nullableString,
    pendingStartupUpdatedNoticeVersion: nullableString,
    pendingUpgradeOnboardingVersion: nullableString
  }).index("by_key", ["key"]),

  dictationHistory: defineTable({
    externalId: s.string(),
    createdAt: s.string(),
    outcome: s.enum(["completed", "error"] as const),
    appName: s.string(),
    windowTitle: nullableString,
    activationMode: s.enum(["push-to-talk", "toggle"] as const),
    modelId: s.string(),
    outputText: s.string(),
    errorMessage: nullableString,
    submittedContext: s.nullable(contextSnapshot),
    usedContext: s.boolean(),
    latencyMs: s.number(),
    audioProcessingMs: s.number(),
    audioSendMs: s.number(),
    timeToFirstTokenMs: s.number(),
    timeToCompleteMs: s.number(),
    insertionStrategy,
    requestedMode: insertionStreamingMode,
    effectiveMode: insertionStreamingMode,
    insertionMethod,
    fallbackUsed: s.boolean(),
    timing: historyTiming,
    durations: historyDurations,
    audio: audioMetadata,
    llm: s.object({
      provider: s.string(),
      modelId: s.string(),
      finishReason: nullableString,
      usedContext: s.boolean()
    }),
    insertion: s.object({
      strategy: insertionStrategy,
      requestedMode: insertionStreamingMode,
      effectiveMode: insertionStreamingMode,
      method: insertionMethod,
      fallbackUsed: s.boolean(),
      targetApp: s.string(),
      writtenCharacterCount: nullableNumber
    }),
    context: s.nullable(contextSnapshot),
    outcomeDetail: s.object({
      status: s.enum(["completed", "error", "notice", "cancelled", "permission-required"] as const),
      errorMessage: nullableString,
      noticeMessage: nullableString
    }),
    text: s.object({
      finalText: s.string(),
      partialText: s.string()
    })
  })
    .index("by_externalId", ["externalId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_outcome", ["outcome"])
    .index("by_appName", ["appName"])
    .index("by_modelId", ["modelId"]),

  telemetryRecords: defineTable({
    externalId: s.string(),
    timestamp: s.string(),
    kind: s.enum(["metric", "error"] as const),
    name: s.string(),
    detail: s.record(s.string(), s.string())
  })
    .index("by_externalId", ["externalId"])
    .index("by_timestamp", ["timestamp"])
});
