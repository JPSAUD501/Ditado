import { createFunctionReference, mutation, query, s } from "../_generated/server.js";

export const listJobs = query({
  args: {},
  handler: async (ctx) => ctx.db.query("maintenanceJobs").withIndex("by_job").collect()
});

export const pruneHistory = mutation({
  args: {
    retentionDays: s.number(),
    maxAudioBytes: s.number()
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.retentionDays * 24 * 60 * 60 * 1000;
    const entries = await ctx.db
      .query("historyEntries")
      .withIndex("by_created")
      .order("desc")
      .collect();
    let audioBytes = 0;
    for (const entry of entries) {
      const audioRecords = await ctx.db
        .query("historyAudio")
        .withIndex("by_history", (q) => q.eq("historyEntryId", entry._id))
        .collect();
      const entryAudioBytes = audioRecords.reduce((sum, audio) => sum + audio.bytes, 0);
      const expired = entry.createdAtMs < cutoff;
      const overBudget = entryAudioBytes > 0 && audioBytes + entryAudioBytes > args.maxAudioBytes;
      if (expired || overBudget) {
        for (const audio of audioRecords) {
          await ctx.storage.delete(audio.storageId).catch(() => undefined);
          await ctx.db.delete("historyAudio", audio._id);
        }
        await ctx.db.delete("historyEntries", entry._id);
      } else {
        audioBytes += entryAudioBytes;
      }
    }
    return null;
  }
});

export const schedulePrune = mutation({
  args: {
    retentionDays: s.number(),
    maxAudioBytes: s.number(),
    delayMs: s.optional(s.number())
  },
  handler: async (ctx, args) => {
    const scheduledAtMs = Date.now() + (args.delayMs ?? 0);
    const existing = await ctx.db
      .query("maintenanceJobs")
      .withIndex("by_job", (q) => q.eq("jobName", "prune-history"))
      .first();
    if (existing) {
      await ctx.db.patch("maintenanceJobs", existing._id, {
        status: "scheduled",
        scheduledAtMs,
        completedAtMs: null,
        detail: {
          retentionDays: String(args.retentionDays),
          maxAudioBytes: String(args.maxAudioBytes)
        }
      });
    } else {
      await ctx.db.insert("maintenanceJobs", {
        jobName: "prune-history",
        status: "scheduled",
        scheduledAtMs,
        completedAtMs: null,
        detail: {
          retentionDays: String(args.retentionDays),
          maxAudioBytes: String(args.maxAudioBytes)
        }
      });
    }
    return ctx.scheduler.runAfter(
      args.delayMs ?? 0,
      createFunctionReference("mutation", "maintenance/pruneHistory"),
      { retentionDays: args.retentionDays, maxAudioBytes: args.maxAudioBytes },
      { type: "run_once_if_missed" }
    );
  }
});
