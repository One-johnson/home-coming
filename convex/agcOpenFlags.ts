import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Keeps the `open` / `live` mirror fields in step with the timestamps they
 * describe.
 *
 * Convex cannot index a field that is missing, and "not ended yet" is exactly a
 * missing field — so the desk, the rooming list and the review queue could only
 * find live rows by reading every row ever written. Each write path now sets the
 * mirror (`true` on insert, `false` when the row is closed), which lets those
 * queries read `by_open` / `by_live` instead of the whole history.
 *
 * Rows written before the mirrors existed have neither, so they are invisible to
 * those indexes until `backfill` runs. It only ever patches the boolean: no row
 * is deleted, and `open`/`live` is recomputed from `endedAt`/`correctedAt`/
 * `resolvedAt` on the row itself. Running it twice is a no-op.
 *
 * `verify` is the safety check: it compares the index against the timestamps and
 * names any row the mirror would hide. It should report zero missing rows after
 * a deploy, and zero stale rows always.
 *
 *   npx convex run agcOpenFlags:backfill
 *   npx convex run agcOpenFlags:verify
 */

/** Rows are patched in one transaction per table; nothing is ever removed. */
export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    let assignments = 0;
    for (const row of await ctx.db.query("agcRoomAssignments").collect()) {
      const open = row.endedAt === undefined;
      if (row.open === open) continue;
      await ctx.db.patch(row._id, { open });
      assignments += 1;
    }

    let checkIns = 0;
    for (const row of await ctx.db.query("agcCheckIns").collect()) {
      const live = !row.correctedAt;
      if (row.live === live) continue;
      await ctx.db.patch(row._id, { live });
      checkIns += 1;
    }

    let flags = 0;
    for (const row of await ctx.db.query("agcCheckinFlags").collect()) {
      const open = row.resolvedAt === undefined;
      if (row.open === open) continue;
      await ctx.db.patch(row._id, { open });
      flags += 1;
    }

    return { patched: { assignments, checkIns, flags } };
  },
});

/** Rows the index would hide (`missing`) or wrongly show (`stale`). */
export const verify = internalQuery({
  args: {},
  handler: async (ctx) => {
    const compare = (
      indexedIds: string[],
      expectedIds: string[],
      field: string,
    ) => {
      const indexed = new Set(indexedIds);
      const expected = new Set(expectedIds);
      return {
        field,
        indexed: indexed.size,
        expected: expected.size,
        /** Live by their timestamps but absent from the index — would vanish. */
        missing: [...expected].filter((id) => !indexed.has(id)).slice(0, 10),
        missingCount: [...expected].filter((id) => !indexed.has(id)).length,
        /** In the index but closed by their timestamps — would linger. */
        stale: [...indexed].filter((id) => !expected.has(id)).slice(0, 10),
        staleCount: [...indexed].filter((id) => !expected.has(id)).length,
      };
    };

    const openAssignments = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_open", (q) => q.eq("open", true))
      .collect();
    const allAssignments = await ctx.db.query("agcRoomAssignments").collect();

    const liveCheckIns = await ctx.db
      .query("agcCheckIns")
      .withIndex("by_live", (q) => q.eq("live", true))
      .collect();
    const allCheckIns = await ctx.db.query("agcCheckIns").collect();

    const openFlags = await ctx.db
      .query("agcCheckinFlags")
      .withIndex("by_open", (q) => q.eq("open", true))
      .collect();
    const allFlags = await ctx.db.query("agcCheckinFlags").collect();

    return {
      assignments: compare(
        openAssignments.map((row) => row._id as string),
        allAssignments
          .filter((row) => row.endedAt === undefined)
          .map((row) => row._id as string),
        "open",
      ),
      checkIns: compare(
        liveCheckIns.map((row) => row._id as string),
        allCheckIns
          .filter((row) => !row.correctedAt)
          .map((row) => row._id as string),
        "live",
      ),
      flags: compare(
        openFlags.map((row) => row._id as string),
        allFlags
          .filter((row) => row.resolvedAt === undefined)
          .map((row) => row._id as string),
        "open",
      ),
    };
  },
});
