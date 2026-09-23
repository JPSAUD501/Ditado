import { mutation, query, s, type MutationCtx } from "../_generated/server.js";
import type { Infer } from "syncorejs";

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

const insertionStreamingMode = s.enum(["letter-by-letter", "all-at-once"] as const);
const insertionMethod = s.enum(["enigo-letter", "clipboard-all-at-once"] as const);
const insertionStrategy = s.enum(["replace-selection", "insert-at-cursor"] as const);

const historyEntry = {
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
  timing,
  durations,
  audio: s.object({
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
  }),
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
};

const historyEntryValidator = s.object(historyEntry);
type HistoryEntryInput = Infer<typeof historyEntryValidator>;

const toStoredAudio = async (
  ctx: MutationCtx,
  input: {
    externalId: string;
    audioBase64?: string;
    mimeType: string | null;
    storageId?: string | null;
  }
) => {
  if (input.storageId) {
    return input.storageId;
  }

  if (!input.audioBase64) {
    return null;
  }

  const data = Buffer.from(input.audioBase64, "base64");
  const objectId = await ctx.storage.put({
    fileName: `${input.externalId}.${input.mimeType?.split("/").at(-1) ?? "audio"}`,
    contentType: input.mimeType ?? "application/octet-stream",
    data
  });
  return typeof (objectId as unknown) === "string"
    ? objectId
    : (objectId as unknown as { id: string }).id;
};

const upsertHistoryEntry = async (
  ctx: MutationCtx,
  entry: HistoryEntryInput
) => {
  const existing = await ctx.db.query("dictationHistory")
    .withIndex("by_externalId", (q) => q.eq("externalId", entry.externalId))
    .unique();

  const nextEntry = existing?.audio.storageId && !entry.audio.storageId
    ? { ...entry, audio: existing.audio }
    : entry;

  if (existing?.audio.storageId && nextEntry.audio.storageId && existing.audio.storageId !== nextEntry.audio.storageId) {
    await ctx.storage.delete(existing.audio.storageId);
  }

  if (existing) {
    await ctx.db.patch("dictationHistory", existing._id, nextEntry);
    return ctx.db.get("dictationHistory", existing._id);
  }

  const id = await ctx.db.insert("dictationHistory", nextEntry);
  return ctx.db.get("dictationHistory", id);
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("dictationHistory").withIndex("by_createdAt").order("desc").collect();
    return rows.map((row) => {
      const { externalId, audio, ...entry } = row;
      delete (entry as { _id?: string })._id;
      delete (entry as { _creationTime?: number })._creationTime;
      return {
      ...entry,
      id: externalId,
      audio: {
        ...audio,
        filePath: null
      },
      audioFilePath: null,
      audioDurationMs: audio.durationMs,
      audioMimeType: audio.mimeType,
      audioBytes: audio.bytes
      };
    });
  }
});

export const append = mutation({
  args: historyEntry,
  handler: async (ctx, args) => upsertHistoryEntry(ctx, args)
});

export const appendWithAudio = mutation({
  args: {
    entry: historyEntryValidator,
    audioBase64: s.string(),
    mimeType: s.string()
  },
  handler: async (ctx, args) => {
    const storageId = await toStoredAudio(ctx, {
      externalId: args.entry.externalId,
      audioBase64: args.audioBase64,
      mimeType: args.mimeType
    });

    return upsertHistoryEntry(ctx, {
      ...args.entry,
      audio: {
        ...args.entry.audio,
        storageId
      }
    });
  }
});

export const deleteEntry = mutation({
  args: { externalId: s.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("dictationHistory")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (!existing) {
      return null;
    }

    if (existing.audio.storageId) {
      await ctx.storage.delete(existing.audio.storageId);
    }
    await ctx.db.delete("dictationHistory", existing._id);
    return null;
  }
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("dictationHistory").collect();
    for (const row of rows) {
      if (row.audio.storageId) {
        await ctx.storage.delete(row.audio.storageId);
      }
      await ctx.db.delete("dictationHistory", row._id);
    }
    return null;
  }
});

export const getAudio = query({
  args: { externalId: s.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("dictationHistory")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (!existing?.audio.storageId || !existing.audio.mimeType) {
      return null;
    }

    const bytes = await ctx.storage.read(existing.audio.storageId);
    if (!bytes) {
      return null;
    }

    return {
      mimeType: existing.audio.mimeType,
      base64: Buffer.from(bytes).toString("base64")
    };
  }
});
