import { mutation, query, s, type MutationCtx } from "../_generated/server.js";
import { withoutSystemFields, type Infer } from "syncorejs";
import schema from "../schema.js";

const historyEntryValidator = schema.tables.dictationHistory.validator;
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
  return ctx.storage.put({
    fileName: `${input.externalId}.${input.mimeType?.split("/").at(-1) ?? "audio"}`,
    contentType: input.mimeType ?? "application/octet-stream",
    data
  });
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
      const { externalId, audio, ...entry } = withoutSystemFields(row);
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
  args: historyEntryValidator,
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
