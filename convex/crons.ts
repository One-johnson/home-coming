import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import {
  reconcileExpiredBookingInventory,
  retireBookingGuests,
} from "./agcAccommodation";
import { MAX_NIGHTLY_BATCHES } from "./storageMaintenance";

const crons = cronJobs();

/**
 * One-off pool repair, runnable from the CLI:
 * `npx convex run crons:reconcileExpiredBookingsOnce`.
 *
 * Expires holds past their window, then returns every bed an expired or
 * cancelled booking still occupies to the pool it came from. Idempotent — beds
 * already released are never returned twice — so it is safe to re-run, and the
 * Pools tab exposes the same repair to admins.
 */
export const reconcileExpiredBookingsOnce = internalMutation({
  args: {},
  handler: async (ctx) => reconcileExpiredBookingInventory(ctx),
});

/**
 * One-off backfill for holds released before guests were retired: their rosters
 * are still `active`, so metrics, exports and the guest lists kept counting
 * delegates from bookings that hold no beds.
 *
 * Copies one page of bookings, retires the roster of every closed or trashed
 * one, and returns a cursor — so it is bounded, idempotent and safe to re-run.
 * Future closes cascade on their own; this only cleans up history.
 *
 * `npx convex run crons:backfillRetiredGuests '{}'`
 * `npx convex run crons:backfillRetiredGuests '{"cursor":"<continueCursor>"}'`
 * …until the result says `isDone: true`.
 */
export const backfillRetiredGuests = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("agcBookings").paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(Math.max(args.pageSize ?? 100, 1), 500),
    });

    let bookings = 0;
    let guests = 0;
    for (const booking of page.page) {
      const closedBefore =
        booking.deletedAt !== undefined ||
        booking.bookingStatus === "expired" ||
        booking.bookingStatus === "cancelled";
      if (!closedBefore) continue;
      const retired = await retireBookingGuests(
        ctx,
        booking._id,
        booking.bookingStatus === "cancelled" ? "cancelled" : "expired",
      );
      if (retired > 0) {
        bookings += 1;
        guests += retired;
      }
    }

    return {
      scanned: page.page.length,
      bookings,
      guests,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Nightly inventory repair (step 1 of `nightlyMaintenance`): lapsed holds are
 * expired, beds still held by finished bookings go back to
 * their pools on their own and the pool counters are rewritten to match the
 * reservations, and the desk is told when something actually moved — nobody
 * has to press the repair button for the inventory to heal.
 */
export const nightlyPoolRepairTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await reconcileExpiredBookingInventory(ctx);
    if (result.units > 0 || result.counterBedsAdjusted > 0) {
      await ctx.runMutation(internal.agcAdminData.alertDeskOfPoolRepair, {
        expiredHolds: result.expiredHolds,
        bookings: result.bookings,
        units: result.units,
        poolsCorrected: result.poolsCorrected,
        counterBedsAdjusted: result.counterBedsAdjusted,
      });
    }
    return result;
  },
});



/**
 * Nightly reclamation of stranded uploads (a `nightlyMaintenance` step): blobs no row points at, older than
 * the 24h grace window — the same rule the admin button applies, so nobody has
 * to press it for storage to stop growing.
 *
 * Each batch is its own transaction (500 files), and the tick runs up to
 * MAX_NIGHTLY_BATCHES of them, stopping as soon as a pass frees nothing. The
 * audit log names "system:storage-sweep" for everything it deletes.
 */
export const nightlyOrphanSweepTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;
    let failed = 0;
    let bytesFreed = 0;
    let remaining = 0;
    let batches = 0;

    for (let pass = 0; pass < MAX_NIGHTLY_BATCHES; pass += 1) {
      const result = await ctx.runMutation(
        internal.storageMaintenance.sweepOrphanedFilesBatch,
        {},
      );
      batches += 1;
      deleted += result.deleted;
      failed += result.failed;
      bytesFreed += result.bytesFreed;
      remaining = result.remaining;
      // Nothing left to reclaim (or every delete in the batch failed, which
      // retrying tonight cannot fix) — stop rather than re-scan uselessly.
      if (result.deleted === 0) break;
    }

    return { deleted, failed, bytesFreed, remaining, batches };
  },
});


/**
 * The only scheduled job: one nightly maintenance pass at 02:30 UTC.
 *
 * Everything here is housekeeping with windows measured in days (72h holds,
 * 7-day rep purge, 15-day receipt retention, 30-day trash), so once a night
 * gives the same outcome as the old 15-minute/hourly crons without an idle
 * deployment re-reading whole tables all day. Lapsed holds that would block a
 * booking during the day are expired on the spot by `reserveUnits`.
 *
 * Each step is its own transaction (an action calling mutations), so a large
 * step never pushes another over Convex's per-mutation limits, and one failing
 * step is logged without stopping the rest.
 */
export const nightlyMaintenance = internalAction({
  args: {},
  handler: async (ctx) => {
    const steps: Array<[string, () => Promise<unknown>]> = [
      // Expire lapsed holds, return beds from finished bookings, rewrite
      // drifted pool counters (and tell the desk if anything moved).
      ["pool repair", () => ctx.runMutation(internal.crons.nightlyPoolRepairTick, {})],
      // Receipt / POA images 15 days after the payment was confirmed.
      ["payment images", () => ctx.runMutation(internal.storageMaintenance.purgeExpiredPaymentImages, {})],
      // Uploads no row points at, older than the 24h grace window.
      ["orphan sweep", () => ctx.runMutation(internal.crons.nightlyOrphanSweepTick, {})],
      // Reps soft-deleted more than 7 days ago.
      ["rep purge", () => ctx.runMutation(internal.agcAdminData.purgeExpiredDeletedReps, {})],
      // Registrations / bookings in the trash more than 30 days.
      ["trash purge", () => ctx.runMutation(internal.agcAdminData.purgeExpiredTrashInternal, {})],
    ];

    const results: Record<string, unknown> = {};
    for (const [name, run] of steps) {
      try {
        results[name] = await run();
      } catch (error) {
        console.error(`nightly maintenance: ${name} failed`, error);
        results[name] = { error: String(error) };
      }
    }
    return results;
  },
});

crons.daily(
  "nightly maintenance",
  { hourUTC: 2, minuteUTC: 30 },
  internal.crons.nightlyMaintenance,
  {},
);

export default crons;
