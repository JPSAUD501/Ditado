import { defineSchema, defineTable, s } from "syncorejs";
import {
  activationMode,
  captureIntent,
  contextSnapshot,
  dictationStatus,
  historyStatus,
  insertionPlan,
  insertionStreamingMode,
  nullableString,
  sessionAudio,
  sessionInsertion,
  sessionLlm,
  sessionTiming
} from "./model.js";

export default defineSchema({
  settings: defineTable({
    key: s.string(),
    launchOnLogin: s.boolean(),
    pushToTalkHotkey: s.string(),
    toggleHotkey: s.string(),
    preferredMicrophoneId: nullableString,
    sendContextAutomatically: s.boolean(),
    updateChannel: s.enum(["stable", "beta"] as const),
    insertionStreamingMode,
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
    activationMode,
    status: dictationStatus,
    captureIntent,
    startedAt: s.string(),
    finishedAt: nullableString,
    processingStartedAt: nullableString,
    targetApp: s.string(),
    context: contextSnapshot,
    insertionPlan,
    partialText: s.string(),
    finalText: s.string(),
    errorMessage: nullableString,
    noticeMessage: nullableString,
    timing: sessionTiming,
    audio: sessionAudio,
    llm: sessionLlm,
    insertion: sessionInsertion,
    historyStatus,
    historyError: nullableString,
    createdAtMs: s.number(),
    updatedAtMs: s.number()
  })
    .index("by_active", ["isActive"])
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
    activationMode,
    modelId: s.string(),
    outputText: s.string(),
    errorMessage: nullableString,
    context: contextSnapshot,
    timing: sessionTiming,
    audio: sessionAudio,
    llm: sessionLlm,
    insertion: sessionInsertion,
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
    .index("by_created", ["createdAtMs"])
});
