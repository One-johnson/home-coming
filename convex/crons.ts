import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { expireOverdueHolds } from "./agcAccommodation";

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
