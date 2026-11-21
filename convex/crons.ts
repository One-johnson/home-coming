import { cronJobs } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  reconcileExpiredBookingInventory,
  retireBookingGuests,
} from "./agcAccommodation";

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
 * The only scheduled job — the nightly inventory repair. Lapsed holds are
 * expired, beds still held by finished bookings go back to
 * their pools on their own and the pool counters are rewritten to match the
 * reservations, and the desk is told when something actually moved — nobody
 * has to press the repair button for the inventory to heal. During the day a
 * lapsed hold that would block a booking is expired on the spot by
 * `reserveUnits`, so nothing needs to poll more often than this.
 *
 * Storage cleanup, receipt retention and the rep / trash purges are admin
 * buttons (Audit log → Housekeeping), not crons: an idle
 * deployment should not spend reads re-scanning tables nobody is changing.
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

export default crons;
