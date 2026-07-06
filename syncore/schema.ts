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

const insertionPlan = s.object({
  strategy: s.enum(["replace-selection", "insert-at-cursor"] as const),
  targetApp: s.string(),
  capability: s.enum(["automation", "clipboard"] as const)
});

const dictationStatus = s.enum([
  "arming",
  "listening",
  "processing",
  "streaming",
  "completed",
  "notice",
  "error",
  "permission-required",
  "cancelled"
] as const);

const captureIntent = s.enum(["none", "start", "stop"] as const);

const timing = s.object({
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

const durations = s.object({
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
  filePath: nullableString,
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

const llmMetadata = s.object({
  provider: s.string(),
  modelId: s.string(),
  finishReason: nullableString,
  usedContext: s.boolean()
});

const insertionMetadata = s.object({
  strategy: s.enum(["replace-selection", "insert-at-cursor"] as const),
  requestedMode: s.enum(["letter-by-letter", "all-at-once"] as const),
  effectiveMode: s.enum(["letter-by-letter", "all-at-once"] as const),
  method: s.enum(["enigo-letter", "clipboard-all-at-once"] as const),
  fallbackUsed: s.boolean(),
  targetApp: s.string(),
  writtenCharacterCount: nullableNumber
});

const outcomeMetadata = s.object({
  status: s.enum(["completed", "error", "notice", "cancelled", "permission-required"] as const),
  errorMessage: nullableString,
  noticeMessage: nullableString
});

const textMetadata = s.object({
  finalText: s.string(),
  partialText: s.string()
});

export default defineSchema({
  settings: defineTable({
    key: s.string(),
    launchOnLogin: s.boolean(),
    pushToTalkHotkey: s.string(),
    toggleHotkey: s.string(),
    preferredMicrophoneId: nullableString,
    sendContextAutomatically: s.boolean(),
    autoUpdateEnabled: s.boolean(),
    updateChannel: s.enum(["stable", "beta"] as const),
    insertionStreamingMode: s.enum(["letter-by-letter", "all-at-once"] as const),
    historyRetentionDays: s.number(),
    maxHistoryAudioBytes: s.number(),
    modelId: s.string(),
    onboardingCompleted: s.boolean(),
    theme: s.enum(["dark", "light", "system"] as const),
    language: s.enum(["en", "pt-BR", "es", "system"] as const),
    lastSeenAppVersion: nullableString,
    pendingStartupUpdatedNoticeVersion: nullableString,
    pendingUpgradeOnboardingVersion: nullableString,
    updatedAt: s.number()
  }).index("by_key", ["key"]),

  dictationSessions: defineTable({
    sessionId: s.string(),
    isActive: s.boolean(),
    activeKey: s.enum(["active", "inactive"] as const),
    activationMode: s.enum(["push-to-talk", "toggle"] as const),
    status: dictationStatus,
    captureIntent,
    startedAt: s.string(),
    finishedAt: nullableString,
    processingStartedAt: nullableString,
    targetApp: s.string(),
    context: contextSnapshot,
    insertionPlan,
    errorMessage: nullableString,
    noticeMessage: nullableString,
    finalText: s.string(),
    partialText: s.string(),
    createdAt: s.string(),
    createdAtMs: s.number(),
    updatedAtMs: s.number()
  })
    .index("by_active", ["activeKey"])
    .index("by_session", ["sessionId"])
    .index("by_created", ["createdAtMs"])
    .index("by_updated", ["updatedAtMs"]),

  historyEntries: defineTable({
    sessionId: s.string(),
    createdAt: s.string(),
    createdAtMs: s.number(),
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
    insertionStrategy: s.enum(["replace-selection", "insert-at-cursor"] as const),
    requestedMode: s.enum(["letter-by-letter", "all-at-once"] as const),
    effectiveMode: s.enum(["letter-by-letter", "all-at-once"] as const),
    insertionMethod: s.enum(["enigo-letter", "clipboard-all-at-once"] as const),
    fallbackUsed: s.boolean(),
    timing,
    durations,
    audio: audioMetadata,
    llm: llmMetadata,
    insertion: insertionMetadata,
    context: s.nullable(contextSnapshot),
    outcomeDetail: outcomeMetadata,
    text: textMetadata,
    searchText: s.string()
  })
    .index("by_session", ["sessionId"])
    .index("by_created", ["createdAtMs"])
    .index("by_outcome_created", ["outcome", "createdAtMs"])
    .index("by_app_created", ["appName", "createdAtMs"])
    .index("by_model_created", ["modelId", "createdAtMs"])
    .searchIndex("search_history", {
      searchField: "searchText",
      filterFields: ["outcome", "appName", "modelId"]
    }),

  historyAudio: defineTable({
    historyEntryId: s.id("historyEntries"),
    sessionId: s.string(),
    storageId: s.string(),
    mimeType: s.string(),
    durationMs: s.number(),
    bytes: s.number(),
    createdAtMs: s.number()
  })
    .index("by_history", ["historyEntryId"])
    .index("by_session", ["sessionId"])
    .index("by_created", ["createdAtMs"]),

  appEvents: defineTable({
    eventId: s.string(),
    kind: s.string(),
    message: s.string(),
    createdAt: s.string(),
    createdAtMs: s.number(),
    detail: s.record(s.string(), s.string())
  }).index("by_created", ["createdAtMs"]),

  maintenanceJobs: defineTable({
    jobName: s.string(),
    status: s.enum(["scheduled", "running", "completed", "failed"] as const),
    scheduledAtMs: s.number(),
    completedAtMs: nullableNumber,
    detail: s.record(s.string(), s.string())
  }).index("by_job", ["jobName"])
});
