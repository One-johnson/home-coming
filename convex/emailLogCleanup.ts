import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * One-off cleanup for the retired email log table. Deletes rows in batches so
 * the table can be emptied before the table definition is removed from the
 * schema.
 */
export const purgeEmailLogs = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batch = Math.min(args.limit ?? 200, 500);
    const rows = await ctx.db.query("emailLogs").take(batch);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length, maybeMore: rows.length === batch };
  },
});
