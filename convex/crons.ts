import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  expireOverdueHolds,
  reconcileExpiredBookingInventory,
  reconcilePoolCounters,
  retireBookingGuests,
} from "./agcAccommodation";

const crons = cronJobs();

/**
 * §32–34: a timed hold expires at the earlier of the hold window (72h by
 * default) and the registration deadline — payment-on-arrival holds never do,
 * because their money is handed over at the venue desk.
 *
 * Runs every 5 minutes; the expiry is idempotent, and the same pass rewrites
 * any pool counters that no longer match the reservations behind them, so
 * availability can never drift away from the bookings holding the beds.
 */
export const expireHoldsTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await expireOverdueHolds(ctx);
    const counters = await reconcilePoolCounters(ctx);
    return { expired, ...counters };
  },
});

crons.interval(
  "expire overdue accommodation holds",
  { minutes: 5 },
  internal.crons.expireHoldsTick,
  {},
);

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
 * Nightly inventory repair: beds still held by finished bookings go back to
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

crons.daily(
  "return beds held by finished bookings",
  { hourUTC: 2, minuteUTC: 30 },
  internal.crons.nightlyPoolRepairTick,
  {},
);

/**
 * Payment receipts and POA evidence are evidence only while the payment is
 * being verified: 15 days after finance confirms it, the image is deleted and
 * an audit entry records what left storage. Runs nightly; idempotent.
 */
crons.daily(
  "delete payment images 15 days after confirmation",
  { hourUTC: 3, minuteUTC: 15 },
  internal.storageMaintenance.purgeExpiredPaymentImages,
  {},
);

/**
 * Permanently purge representative accounts that were soft-deleted more than
 * 7 days ago (REP_SOFT_DELETE_TTL_MS). Runs hourly; the purge is idempotent.
 */
export const purgeDeletedRepsTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result: { purged: number } = await ctx.runMutation(
      internal.agcAdminData.purgeExpiredDeletedReps,
      {},
    );
    return result;
  },
});

crons.interval(
  "purge soft-deleted representative accounts",
  { hours: 1 },
  internal.crons.purgeDeletedRepsTick,
  {},
);

/**
 * Permanently purge AGC registrations/bookings soft-deleted more than 30
 * days ago (AGC_TRASH_TTL_MS). Runs hourly; idempotent.
 */
export const purgeAgcTrashTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result: { purged: number } = await ctx.runMutation(
      internal.agcAdminData.purgeExpiredTrashInternal,
      {},
    );
    return result;
  },
});

crons.interval(
  "purge soft-deleted AGC registrations and bookings",
  { hours: 1 },
  internal.crons.purgeAgcTrashTick,
  {},
);

export default crons;
