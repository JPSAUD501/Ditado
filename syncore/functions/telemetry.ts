import { mutation, query, s } from "../_generated/server.js";
import type { Infer } from "syncorejs";

const TELEMETRY_LIMIT = 10_000;

const telemetryRecord = {
  externalId: s.string(),
  timestamp: s.string(),
  kind: s.enum(["metric", "error"] as const),
  name: s.string(),
  detail: s.record(s.string(), s.string())
};
const telemetryRecordValidator = s.object(telemetryRecord);
type TelemetryRecordInput = Infer<typeof telemetryRecordValidator>;

export const tail = query({
  args: { limit: s.optional(s.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(0, Math.min(args.limit ?? 30, TELEMETRY_LIMIT));
    const rows = await ctx.db.query("telemetryRecords").withIndex("by_timestamp").order("desc").take(limit);
    return rows.map((row) => {
      const { externalId, ...record } = row;
      delete (record as { _id?: string })._id;
      delete (record as { _creationTime?: number })._creationTime;
      return {
        ...record,
        id: externalId
      };
    });
  }
});

export const append = mutation({
  args: telemetryRecord,
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
