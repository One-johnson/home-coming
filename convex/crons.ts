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

export default crons;
