import { mutation, query, s } from "../_generated/server.js";

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

const historyEntryInput = {
  id: s.string(),
  createdAt: s.string(),
  outcome: s.enum(["completed", "error"] as const),
  appName: s.string(),
  windowTitle: nullableString,
  activationMode: s.enum(["push-to-talk", "toggle"] as const),
  modelId: s.string(),
  outputText: s.string(),
  errorMessage: nullableString,
  audioFilePath: nullableString,
  audioDurationMs: s.number(),
  audioMimeType: nullableString,
  audioBytes: s.number(),
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
  text: textMetadata
};

const audioPayload = {
  audioBase64: s.string(),
  mimeType: s.string(),
  durationMs: s.number()
};

const decodeBase64 = (base64: string): Uint8Array => {
  const buffer = globalThis.Buffer?.from(base64, "base64");
  if (!buffer) {
    throw new Error("Base64 decoding is unavailable in this runtime.");
  }
  return buffer;
};

const createdAtMs = (createdAt: string): number => {
  const value = Date.parse(createdAt);
  return Number.isFinite(value) ? value : Date.now();
};

const searchTextFor = (entry: {
  outputText: string;
  appName: string;
  windowTitle: string | null;
  errorMessage: string | null;
  context: { selectedText: string } | null;
}): string =>
  [
    entry.outputText,
    entry.appName,
    entry.windowTitle ?? "",
    entry.errorMessage ?? "",
    entry.context?.selectedText ?? ""
  ].join("\n");

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("historyEntries").withIndex("by_created").order("desc").collect()
});

export const page = query({
  args: {
    paginationOpts: s.object({
      cursor: s.nullable(s.string()),
      numItems: s.number()
    })
  },
  handler: async (ctx, args) =>
    ctx.db
      .query("historyEntries")
      .withIndex("by_created")
      .order("desc")
      .paginate(args.paginationOpts)
});

export const search = query({
  args: {
    query: s.string()
  },
  handler: async (ctx, args) => {
    if (!args.query.trim()) {
      return [];
    }
    return ctx.db
      .query("historyEntries")
      .withSearchIndex("search_history", (search) => search.search("searchText", args.query))
      .collect();
  }
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("historyEntries").withIndex("by_created").collect();
    const completed = entries.filter((entry) => entry.outcome === "completed");
    return {
      total: entries.length,
      completed: completed.length,
      errors: entries.length - completed.length,
      totalAudioMs: entries.reduce((sum, entry) => sum + entry.audio.durationMs, 0),
      totalCharacters: entries.reduce((sum, entry) => sum + entry.outputText.length, 0),
      averageLatencyMs: entries.length
        ? Math.round(entries.reduce((sum, entry) => sum + entry.latencyMs, 0) / entries.length)
        : 0
    };
  }
});

export const appendWithAudio = mutation({
  args: {
    entry: s.object(historyEntryInput),
    audio: s.object(audioPayload)
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("historyEntries")
      .withIndex("by_session", (q) => q.eq("sessionId", args.entry.id))
      .first();
    if (existing) {
      const existingAudio = await ctx.db
        .query("historyAudio")
        .withIndex("by_history", (q) => q.eq("historyEntryId", existing._id))
        .collect();
      for (const audio of existingAudio) {
        await ctx.storage.delete(audio.storageId).catch(() => undefined);
        await ctx.db.delete("historyAudio", audio._id);
      }
      await ctx.db.delete("historyEntries", existing._id);
    }

    const now = createdAtMs(args.entry.createdAt);
    const bytes = decodeBase64(args.audio.audioBase64);
    const storageId = await ctx.storage.put({
      data: bytes,
      fileName: `${args.entry.id}.${args.audio.mimeType.includes("wav") ? "wav" : "audio"}`,
      contentType: args.audio.mimeType
    });
    const storedAudio = {
      ...args.entry.audio,
      filePath: null,
      durationMs: args.audio.durationMs,
      mimeType: args.audio.mimeType,
      bytes: bytes.byteLength
    };
    const historyEntryId = await ctx.db.insert("historyEntries", {
      ...args.entry,
      sessionId: args.entry.id,
      createdAtMs: now,
      audio: storedAudio,
      searchText: searchTextFor({ ...args.entry, context: args.entry.context })
    });
    await ctx.db.insert("historyAudio", {
      historyEntryId,
      sessionId: args.entry.id,
      storageId,
      mimeType: args.audio.mimeType,
      durationMs: args.audio.durationMs,
      bytes: bytes.byteLength,
      createdAtMs: now
    });
    return null;
  }
});

export const remove = mutation({
  args: {
    sessionId: s.string()
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("historyEntries")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!entry) {
      return null;
    }
    const audioRecords = await ctx.db
      .query("historyAudio")
      .withIndex("by_history", (q) => q.eq("historyEntryId", entry._id))
      .collect();
    for (const audio of audioRecords) {
      await ctx.storage.delete(audio.storageId).catch(() => undefined);
      await ctx.db.delete("historyAudio", audio._id);
    }
    await ctx.db.delete("historyEntries", entry._id);
    return null;
  }
});

export const clear = mutation({
  args: {},
  returns: s.null(),
  handler: async (ctx) => {
    const audioRecords = await ctx.db.query("historyAudio").collect();
    for (const audio of audioRecords) {
      await ctx.storage.delete(audio.storageId).catch(() => undefined);
      await ctx.db.delete("historyAudio", audio._id);
    }
    const entries = await ctx.db.query("historyEntries").collect();
    for (const entry of entries) {
      await ctx.db.delete("historyEntries", entry._id);
    }
    return null;
  }
});

export const audio = query({
  args: {
    sessionId: s.string()
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("historyAudio")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!record) {
      return null;
    }
    const bytes = await ctx.storage.read(record.storageId);
    if (!bytes) {
      return null;
    }
    return {
      mimeType: record.mimeType,
      base64: Buffer.from(bytes).toString("base64")
    };
  }
});
