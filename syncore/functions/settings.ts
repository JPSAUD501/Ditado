import { mutation, query, type QueryCtx } from "../_generated/server.js";
import schema from "../schema.js";

const SETTINGS_KEY = "default";

// Derived from the table so a new settings column can't be silently dropped.
const settingsFields = schema.tables.appSettings.validator.omit("key");
const settingsPatchFields = settingsFields.partial();

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
