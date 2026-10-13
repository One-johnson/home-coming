import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  expireOverdueHolds,
  reconcileExpiredBookingInventory,
} from "./agcAccommodation";

const crons = cronJobs();

/**
 * §32–34: holds expire at the earlier of 72h or the registration deadline.
 * Runs every 5 minutes; the release is idempotent (only `reserved` bookings
 * whose expiresAt has lapsed are touched).
 */
export const expireHoldsTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await expireOverdueHolds(ctx);
    return { expired };
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
 * Nightly inventory repair: beds still held by finished bookings go back to
 * their pools on their own, and the desk is told when something actually
 * moved — nobody has to press the repair button for the inventory to heal.
 */
export const nightlyPoolRepairTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await reconcileExpiredBookingInventory(ctx);
    if (result.units > 0) {
      await ctx.runMutation(internal.agcAdminData.alertDeskOfPoolRepair, {
        expiredHolds: result.expiredHolds,
        bookings: result.bookings,
        units: result.units,
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
