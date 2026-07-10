import { mutation, query, s, type DocPatch } from "../_generated/server.js";
import { insertionStreamingMode } from "../model.js";

const SETTINGS_KEY = "current";

const settingsPatch = {
  launchOnLogin: s.optional(s.boolean()),
  pushToTalkHotkey: s.optional(s.string()),
  toggleHotkey: s.optional(s.string()),
  preferredMicrophoneId: s.optional(s.nullable(s.string())),
  sendContextAutomatically: s.optional(s.boolean()),
  updateChannel: s.optional(s.enum(["stable", "beta"] as const)),
  insertionStreamingMode: s.optional(insertionStreamingMode),
  historyRetentionDays: s.optional(s.number()),
  maxHistoryAudioBytes: s.optional(s.number()),
  modelId: s.optional(s.string()),
  onboardingCompleted: s.optional(s.boolean()),
  theme: s.optional(s.enum(["dark", "light", "system"] as const)),
  language: s.optional(s.enum(["en", "pt-BR", "es", "system"] as const)),
  lastSeenAppVersion: s.optional(s.nullable(s.string())),
  pendingStartupUpdatedNoticeVersion: s.optional(s.nullable(s.string())),
  pendingUpgradeOnboardingVersion: s.optional(s.nullable(s.string()))
};

const defaultStoredSettings = (appVersion: string) => ({
  key: SETTINGS_KEY,
  launchOnLogin: true,
  pushToTalkHotkey: "Ctrl+Meta",
  toggleHotkey: "",
  preferredMicrophoneId: null,
  sendContextAutomatically: true,
  updateChannel: "stable" as const,
  insertionStreamingMode: "letter-by-letter" as const,
  historyRetentionDays: 365,
  maxHistoryAudioBytes: 512 * 1024 * 1024,
  modelId: "google/gemini-3-flash-preview",
  onboardingCompleted: false,
  theme: "system" as const,
  language: "system" as const,
  lastSeenAppVersion: appVersion,
  pendingStartupUpdatedNoticeVersion: null,
  pendingUpgradeOnboardingVersion: null,
  updatedAt: Date.now()
});
export const get = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first()
});

export const ensure = mutation({
  args: { appVersion: s.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();
    if (existing) {
      return existing;
    }

    const id = await ctx.db.insert(
      "settings",
      defaultStoredSettings(args.appVersion)
    );
    const created = await ctx.db.get("settings", id);
    if (!created) {
      throw new Error("Settings initialization did not create a document.");
    }
    return created;
  }
});

export const update = mutation({
  args: { patch: s.object(settingsPatch) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .first();
    if (!existing) {
      throw new Error("Settings have not been initialized.");
    }

    const patch: DocPatch<"settings"> = {
      ...args.patch,
      updatedAt: Date.now()
    };
    await ctx.db.patch("settings", existing._id, patch);
    const updated = await ctx.db.get("settings", existing._id);
    if (!updated) {
      throw new Error("Settings disappeared after update.");
    }
    return updated;
  }
});
