import { s } from "syncorejs";

export const nullableString = s.nullable(s.string());
export const nullableNumber = s.nullable(s.number());

export const activationMode = s.enum(["push-to-talk", "toggle"] as const);
export const dictationStatus = s.enum([
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
export const captureIntent = s.enum(["none", "start", "stop"] as const);
export const insertionStrategy = s.enum([
  "replace-selection",
  "insert-at-cursor"
] as const);
export const insertionStreamingMode = s.enum([
  "letter-by-letter",
  "all-at-once"
] as const);
export const insertionMethod = s.enum([
  "enigo-letter",
  "clipboard-all-at-once"
] as const);

export const contextSnapshot = s.object({
  appName: s.string(),
  windowTitle: nullableString,
  selectedText: s.string(),
  permissionsGranted: s.boolean(),
  confidence: s.enum(["high", "partial", "low"] as const),
  capturedAt: s.string()
});

export const insertionPlan = s.object({
  strategy: insertionStrategy,
  targetApp: s.string(),
  capability: s.enum(["automation", "clipboard"] as const)
});

export const sessionTiming = s.object({
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

export const sessionAudio = s.object({
  durationMs: s.number(),
  mimeType: nullableString,
  bytes: s.number(),
  speechDetected: s.boolean(),
  peakAmplitude: s.number(),
  rmsAmplitude: s.number(),
  languageHint: nullableString,
  stopReason: s.enum([
    "user-stop",
    "max-duration",
    "cancelled",
    "unknown"
  ] as const),
  maxDurationReached: s.boolean()
});

export const sessionLlm = s.object({
  provider: s.string(),
  modelId: s.string(),
  finishReason: nullableString,
  usedContext: s.boolean()
});

export const sessionInsertion = s.object({
  strategy: insertionStrategy,
  requestedMode: insertionStreamingMode,
  effectiveMode: insertionStreamingMode,
  method: insertionMethod,
  fallbackUsed: s.boolean(),
  targetApp: s.string(),
  writtenCharacterCount: nullableNumber
});

export const historyStatus = s.enum([
  "pending",
  "saved",
  "failed",
  "not-required"
] as const);

export const terminalAudit = s.object({
  timing: sessionTiming,
  audio: sessionAudio,
  llm: sessionLlm,
  insertion: sessionInsertion
});
