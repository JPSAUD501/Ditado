import { mutation, query, s } from "../_generated/server.js";

const LEGACY_IMPORT_KEY = "legacyImportCompleted";

export const status = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("appMetadata").withIndex("by_key", (q) => q.eq("key", LEGACY_IMPORT_KEY)).unique()
});

export const markLegacyImportCompleted = mutation({
  args: { completedAt: s.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("appMetadata")
      .withIndex("by_key", (q) => q.eq("key", LEGACY_IMPORT_KEY))
      .unique();
    const value = "true";
    if (existing) {
      await ctx.db.patch("appMetadata", existing._id, { value, updatedAt: args.completedAt });
      return null;
    }
    await ctx.db.insert("appMetadata", { key: LEGACY_IMPORT_KEY, value, updatedAt: args.completedAt });
    return null;
  }
});
