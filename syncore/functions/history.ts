import {
  mutation,
  query,
  s,
  type Doc,
  type MutationCtx
} from "../_generated/server.js";

const decodeBase64 = (base64: string): Uint8Array => {
  const buffer = globalThis.Buffer?.from(base64, "base64");
  if (!buffer) {
    throw new Error("Base64 decoding is unavailable in this runtime.");
  }
  return buffer;
};

const getSession = async (ctx: MutationCtx, sessionId: string) =>
  ctx.db
    .query("dictationSessions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .first();

const markHistoryFailed = async (
  ctx: MutationCtx,
  session: Doc<"dictationSessions">,
  error: unknown
) => {
  await ctx.db.patch("dictationSessions", session._id, {
    historyStatus: "failed",
    historyError:
      error instanceof Error ? error.message : "History persistence failed.",
    updatedAtMs: Date.now()
  });
  const updated = await ctx.db.get("dictationSessions", session._id);
  if (!updated) {
    throw new Error("Session disappeared while recording history failure.");
  }
  return updated;
};

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
  args: { query: s.string() },
  handler: async (ctx, args) => {
    const searchTerm = args.query.trim();
    if (!searchTerm) {
      return [];
    }
    return ctx.db
      .query("historyEntries")
      .withSearchIndex("search_history", (search) =>
        search.search("searchText", searchTerm)
      )
      .collect();
  }
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db
      .query("historyEntries")
      .withIndex("by_created")
      .collect();
    const completed = entries.filter((entry) => entry.outcome === "completed");
    const appCounts = new Map<string, number>();
    for (const entry of entries) {
      appCounts.set(entry.appName, (appCounts.get(entry.appName) ?? 0) + 1);
    }
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const totalLlmMs = entries.reduce((sum, entry) => {
      const start = entry.timing.llmRequestStartedMs;
      const end = entry.timing.llmCompletedMs;
      return sum + (start !== null && end !== null ? Math.max(0, end - start) : 0);
    }, 0);
    return {
      total: entries.length,
      completed: completed.length,
      errors: entries.length - completed.length,
      totalAudioMs: entries.reduce(
        (sum, entry) => sum + entry.audio.durationMs,
        0
      ),
      totalCharacters: entries.reduce(
        (sum, entry) => sum + entry.outputText.length,
        0
      ),
      averageLatencyMs: entries.length
        ? Math.round(totalLlmMs / entries.length)
        : 0,
      topApps: [...appCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([appName, count]) => ({ appName, count })),
      weekActivity: Array.from({ length: 7 }, (_, index) => {
        const dayStart = now - (6 - index) * dayMs;
        const dayEnd = dayStart + dayMs;
        return entries.filter(
          (entry) => entry.createdAtMs >= dayStart && entry.createdAtMs < dayEnd
        ).length;
      })
    };
  }
});

export const appendWithAudio = mutation({
  args: {
    sessionId: s.string(),
    audioBase64: s.string(),
    mimeType: s.string(),
    durationMs: s.number()
  },
  handler: async (ctx, args) => {
    const session = await getSession(ctx, args.sessionId);
    if (!session) {
      throw new Error("Cannot save history for an unknown session.");
    }
    if (session.status !== "completed" && session.status !== "error") {
      throw new Error(`Cannot save history from ${session.status}.`);
    }

    const existing = await ctx.db
      .query("historyEntries")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) {
      const existingAudio = await ctx.db
        .query("historyAudio")
        .withIndex("by_history", (q) => q.eq("historyEntryId", existing._id))
        .first();
      if (existingAudio) {
        await ctx.db.patch("dictationSessions", session._id, {
          audio: existing.audio,
          historyStatus: "saved",
          historyError: null,
          updatedAtMs: Date.now()
        });
        const updatedSession = await ctx.db.get("dictationSessions", session._id);
        if (!updatedSession) {
          throw new Error("Session disappeared while reconciling saved history.");
        }
        return { entry: existing, session: updatedSession };
      }
      await ctx.db.delete("historyEntries", existing._id);
    }

    let bytes: Uint8Array;
    let storageId: string;
    let historyEntryId: Doc<"historyEntries">["_id"] | null = null;
    let historyAudioId: Doc<"historyAudio">["_id"] | null = null;
    try {
      bytes = decodeBase64(args.audioBase64);
      storageId = await ctx.storage.put({
        data: bytes,
        fileName: `${session.sessionId}.${args.mimeType.includes("wav") ? "wav" : "audio"}`,
        contentType: args.mimeType
      });
    } catch (error) {
      return { entry: null, session: await markHistoryFailed(ctx, session, error) };
    }

    try {
      const audio = {
        ...session.audio,
        durationMs: args.durationMs,
        mimeType: args.mimeType,
        bytes: bytes.byteLength
      };
      const searchText = [
        session.finalText || session.partialText,
        session.context.appName,
        session.context.windowTitle ?? "",
        session.errorMessage ?? "",
        session.context.selectedText
      ].join("\n");
      historyEntryId = await ctx.db.insert("historyEntries", {
        sessionId: session.sessionId,
        createdAt: session.finishedAt ?? session.startedAt,
        createdAtMs: session.updatedAtMs,
        outcome: session.status,
        appName: session.context.appName,
        windowTitle: session.context.windowTitle,
        activationMode: session.activationMode,
        modelId: session.llm.modelId,
        outputText: session.finalText || session.partialText,
        errorMessage: session.errorMessage,
        context: session.context,
        timing: session.timing,
        audio,
        llm: session.llm,
        insertion: session.insertion,
        searchText
      });
      historyAudioId = await ctx.db.insert("historyAudio", {
        historyEntryId,
        sessionId: session.sessionId,
        storageId,
        mimeType: args.mimeType,
        durationMs: args.durationMs,
        bytes: bytes.byteLength,
        createdAtMs: session.updatedAtMs
      });
      await ctx.db.patch("dictationSessions", session._id, {
        audio,
        historyStatus: "saved",
        historyError: null,
        updatedAtMs: Date.now()
      });
      const entry = await ctx.db.get("historyEntries", historyEntryId);
      const updatedSession = await ctx.db.get("dictationSessions", session._id);
      if (!entry || !updatedSession) {
        throw new Error("History transaction did not produce its documents.");
      }
      return { entry, session: updatedSession };
    } catch (error) {
      if (historyAudioId) {
        await ctx.db.delete("historyAudio", historyAudioId).catch(() => undefined);
      }
      if (historyEntryId) {
        await ctx.db.delete("historyEntries", historyEntryId).catch(() => undefined);
      }
      await ctx.storage.delete(storageId).catch(() => undefined);
      return { entry: null, session: await markHistoryFailed(ctx, session, error) };
    }
  }
});

export const remove = mutation({
  args: { sessionId: s.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("historyEntries")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (!entry) {
      return false;
    }
    const audioRecords = await ctx.db
      .query("historyAudio")
      .withIndex("by_history", (q) => q.eq("historyEntryId", entry._id))
      .collect();
    for (const audio of audioRecords) {
      await ctx.storage.delete(audio.storageId);
      await ctx.db.delete("historyAudio", audio._id);
    }
    await ctx.db.delete("historyEntries", entry._id);
    return true;
  }
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const audioRecords = await ctx.db.query("historyAudio").collect();
    for (const audio of audioRecords) {
      await ctx.storage.delete(audio.storageId);
      await ctx.db.delete("historyAudio", audio._id);
    }
    const entries = await ctx.db.query("historyEntries").collect();
    for (const entry of entries) {
      await ctx.db.delete("historyEntries", entry._id);
    }
    return { deletedEntries: entries.length, deletedAudio: audioRecords.length };
  }
});

export const audio = query({
  args: { sessionId: s.string() },
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
