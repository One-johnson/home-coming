import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Whether a hub has been granted the "payment on arrival" feature by an
 * admin (a row in agcPoaHubs). Enforced server-side on every POA mutation —
 * removing the grant immediately blocks new POA registrations/bookings.
 */
export async function isHubPoaEnabled(
  ctx: QueryCtx,
  hubId: Id<"agcHubs">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("agcPoaHubs")
    .withIndex("by_hub", (q) => q.eq("hubId", hubId))
    .collect();
  return rows.length > 0;
}

/**
 * Whether an unconfirmed POA booking can still be collected at the desk.
 *
 * A POA hold is deliberately off the reservation window: its beds stay held
 * until the venue desk confirms the payment or the booking is closed by hand
 * (`cancelled`, or expired by an admin). A closed booking keeps no beds, so it
 * stays in the POA tables for the audit trail but is left out of the
 * collection sheet, the reconciliation, and the desk queue.
 */
export function isCollectiblePoaBooking(booking: {
  bookingStatus: string;
}): boolean {
  return (
    booking.bookingStatus !== "expired" &&
    booking.bookingStatus !== "cancelled"
  );
}
