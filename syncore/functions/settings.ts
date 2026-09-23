import { mutation, query, s, type QueryCtx } from "../_generated/server.js";

const SETTINGS_KEY = "default";

const settingsFields = {
  launchOnLogin: s.boolean(),
  pushToTalkHotkey: s.string(),
  toggleHotkey: s.string(),
  preferredMicrophoneId: s.nullable(s.string()),
  sendContextAutomatically: s.boolean(),
  telemetryEnabled: s.boolean(),
  autoUpdateEnabled: s.boolean(),
  updateChannel: s.enum(["stable", "beta"] as const),
  insertionStreamingMode: s.enum(["letter-by-letter", "all-at-once"] as const),
  historyRetentionDays: s.number(),
  maxHistoryAudioBytes: s.number(),
  modelId: s.string(),
  onboardingCompleted: s.boolean(),
  theme: s.enum(["dark", "light", "system"] as const),
  language: s.enum(["en", "pt-BR", "es", "system"] as const),
  lastSeenAppVersion: s.nullable(s.string()),
  pendingStartupUpdatedNoticeVersion: s.nullable(s.string()),
  pendingUpgradeOnboardingVersion: s.nullable(s.string())
};

const settingsPatchFields = {
  launchOnLogin: s.optional(s.boolean()),
  pushToTalkHotkey: s.optional(s.string()),
  toggleHotkey: s.optional(s.string()),
  preferredMicrophoneId: s.optional(s.nullable(s.string())),
  sendContextAutomatically: s.optional(s.boolean()),
  telemetryEnabled: s.optional(s.boolean()),
  autoUpdateEnabled: s.optional(s.boolean()),
  updateChannel: s.optional(s.enum(["stable", "beta"] as const)),
  insertionStreamingMode: s.optional(s.enum(["letter-by-letter", "all-at-once"] as const)),
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

const getSettingsDoc = async (ctx: QueryCtx) =>
  ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY)).unique();

export const get = query({
  args: {},
  handler: async (ctx) => getSettingsDoc(ctx)
});

export const ensureInitialized = mutation({
  args: settingsFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY)).unique();
    if (existing) {
      await ctx.db.patch("appSettings", existing._id, args);
      return { ...existing, ...args };
    }

    const id = await ctx.db.insert("appSettings", { key: SETTINGS_KEY, ...args });
    return ctx.db.get("appSettings", id);
  }
});

export const patch = mutation({
  args: settingsPatchFields,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("appSettings").withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY)).unique();
    if (!existing) {
      throw new Error("Settings have not been initialized.");
    }

    await ctx.db.patch("appSettings", existing._id, args);
    return ctx.db.get("appSettings", existing._id);
  }
});
