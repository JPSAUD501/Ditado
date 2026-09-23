import { mutation, query, s } from "../_generated/server.js";
import { withoutSystemFields, type Infer } from "syncorejs";
import schema from "../schema.js";

const TELEMETRY_LIMIT = 10_000;

const telemetryRecordValidator = schema.tables.telemetryRecords.validator;
type TelemetryRecordInput = Infer<typeof telemetryRecordValidator>;

export const tail = query({
  args: { limit: s.optional(s.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(args.limit ?? 30, TELEMETRY_LIMIT));
    const rows = await ctx.db.query("telemetryRecords").withIndex("by_timestamp").order("desc").take(limit);
    return rows.map((row) => {
      const { externalId, ...record } = withoutSystemFields(row);
      return {
        ...record,
        id: externalId
      };
    });
  }
});

export const append = mutation({
  args: telemetryRecordValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("telemetryRecords")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();

    if (existing) {
      await ctx.db.patch("telemetryRecords", existing._id, args);
    } else {
      await ctx.db.insert("telemetryRecords", args);
    }

    const rows = await ctx.db.query("telemetryRecords").withIndex("by_timestamp").order("desc").collect();
    for (const stale of rows.slice(TELEMETRY_LIMIT)) {
      await ctx.db.delete("telemetryRecords", stale._id);
    }

    return null;
  }
});

export const importLegacy = mutation({
  args: {
    records: s.array(telemetryRecordValidator)
  },
  handler: async (ctx, args) => {
    for (const record of args.records as TelemetryRecordInput[]) {
      const existing = await ctx.db.query("telemetryRecords")
        .withIndex("by_externalId", (q) => q.eq("externalId", record.externalId))
        .unique();

      if (existing) {
        await ctx.db.patch("telemetryRecords", existing._id, record);
      } else {
        await ctx.db.insert("telemetryRecords", record);
      }
    }

    const rows = await ctx.db.query("telemetryRecords").withIndex("by_timestamp").order("desc").collect();
    for (const stale of rows.slice(TELEMETRY_LIMIT)) {
      await ctx.db.delete("telemetryRecords", stale._id);
    }

    return null;
  }
});
