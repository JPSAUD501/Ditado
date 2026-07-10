import { mutation } from "../_generated/server.js";

const SETTINGS_KEY = "current";
const DAY_MS = 24 * 60 * 60 * 1000;

export const pruneHistory = mutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();
    if (!settings) {
      throw new Error("Settings must exist before history maintenance runs.");
    }

    const cutoff = Date.now() - settings.historyRetentionDays * DAY_MS;
    const entries = await ctx.db
      .query("historyEntries")
      .withIndex("by_created")
      .order("desc")
      .collect();
    let retainedAudioBytes = 0;
    let deletedEntries = 0;
    let deletedAudio = 0;

    for (const entry of entries) {
      const audioRecords = await ctx.db
        .query("historyAudio")
        .withIndex("by_history", (q) => q.eq("historyEntryId", entry._id))
        .collect();
      const entryAudioBytes = audioRecords.reduce(
        (sum, audio) => sum + audio.bytes,
        0
      );
      const expired = entry.createdAtMs < cutoff;
      const overBudget =
        entryAudioBytes > 0 &&
        retainedAudioBytes + entryAudioBytes > settings.maxHistoryAudioBytes;
      if (!expired && !overBudget) {
        retainedAudioBytes += entryAudioBytes;
        continue;
      }

      for (const audio of audioRecords) {
        await ctx.storage.delete(audio.storageId);
        await ctx.db.delete("historyAudio", audio._id);
        deletedAudio += 1;
      }
      await ctx.db.delete("historyEntries", entry._id);
      deletedEntries += 1;
    }

    return { deletedEntries, deletedAudio, retainedAudioBytes };
  }
});
