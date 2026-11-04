import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { patchCheckIn } from "./lib/deskStats";

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
 * those indexes until `backfill` runs: the arrival desk then reports nobody
 * assigned and nobody checked in while the rows sit there unread. It only ever
 * patches the boolean: no row is deleted, and `open`/`live` is recomputed from
 * `endedAt`/`correctedAt`/`resolvedAt` on the row itself.
 *
 * Production outgrew a single pass — one transaction may read at most 4,096
 * documents, and the room-assignment table alone is larger than that, so the
 * one-shot version failed with "Too many reads" and the mirrors stayed unset.
 * `backfill` therefore patches one page per call and reports `isDone` and the
 * cursor to continue from. Run the runner, which loops until every table is
 * done (also against production):
 *
 *   node scripts/backfill-open-mirrors.mjs --prod
 *
 * `verify` is the safety check: it compares each index against the timestamps
 * and names any row the mirror would hide. It must report zero missing rows
 * after a backfill, and zero stale rows always.
 *
 *   npx convex run agcOpenFlags:verify --prod
 */

/** One page of one table. Call again with `cursor` until `isDone` is true. */
export const backfill = internalMutation({
  args: {
    table: v.union(
      v.literal("assignments"),
      v.literal("checkIns"),
      v.literal("flags"),
    ),
    /** Opaque cursor from the previous page; omit for the first page. */
    cursor: v.optional(v.string()),
    /** Rows per call. Kept well under the 4,096-read ceiling. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.min(Math.max(Math.floor(args.limit ?? 500), 1), 1000);
    const cursor = args.cursor ?? null;
    let scanned = 0;
    let patched = 0;
    let isDone = false;
    let next: string | null = null;

    if (args.table === "assignments") {
      const page = await ctx.db
        .query("agcRoomAssignments")
        .paginate({ numItems, cursor });
      scanned = page.page.length;
      isDone = page.isDone;
      next = page.continueCursor;
      for (const row of page.page) {
        const open = row.endedAt === undefined;
        if (row.open === open) continue;
        await ctx.db.patch(row._id, { open });
        patched += 1;
      }
    } else if (args.table === "checkIns") {
      const page = await ctx.db
        .query("agcCheckIns")
        .paginate({ numItems, cursor });
      scanned = page.page.length;
      isDone = page.isDone;
      next = page.continueCursor;
      for (const row of page.page) {
        const live = !row.correctedAt;
        if (row.live === live) continue;
        // Through the desk counters: a row becoming live joins the totals.
        await patchCheckIn(ctx, row._id, { live });
        patched += 1;
      }
    } else {
      const page = await ctx.db
        .query("agcCheckinFlags")
        .paginate({ numItems, cursor });
      scanned = page.page.length;
      isDone = page.isDone;
      next = page.continueCursor;
      for (const row of page.page) {
        const open = row.resolvedAt === undefined;
        if (row.open === open) continue;
        await ctx.db.patch(row._id, { open });
        patched += 1;
      }
    }

    return {
      table: args.table,
      scanned,
      patched,
      isDone,
      cursor: isDone ? null : next,
    };
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
