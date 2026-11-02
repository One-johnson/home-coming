import { v } from "convex/values";
import { query } from "./_generated/server";
import { getRegistrationDeadline, getRepByToken } from "./agcPortal";
import { buildRepBookings } from "./agcBookings";
import { buildRepRoomAssignments } from "./agcRoomAssignments";

/**
 * Everything the rep notification bell needs, in one call.
 *
 * The bell used to subscribe to `listRepBookings`, `getRepOverview` and
 * `getRepRoomAssignments` separately. Those three read the same rep, booking and
 * rooming rows, so every write in a rep's hub re-ran all three on every portal
 * that was open. Same data, same numbers, one execution per invalidation.
 */
export const getRepNotificationDigest = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const access = await getRepByToken(ctx, args.sessionToken);
    if (!access) return null;
    const { rep } = access;

    const [bookings, publishedRooms, registrations] = await Promise.all([
      buildRepBookings(ctx, rep._id),
      buildRepRoomAssignments(ctx, rep),
      ctx.db
        .query("agcRegistrations")
        .withIndex("by_rep", (q) => q.eq("repId", rep._id))
        .collect(),
    ]);

    // Same receipts/awaiting rules as agcPortal.getRepOverview: registrations
    // and accommodation bookings both raise these two counters.
    let receiptsPending = 0;
    let awaitingPayment = 0;
    for (const row of registrations) {
      if (
        row.paymentStatus === "pending_verification" ||
        row.paymentStatus === "correction_requested"
      ) {
        receiptsPending += 1;
      }
      if (row.paymentStatus === "awaiting_payment") {
        awaitingPayment += 1;
      }
    }
    for (const booking of bookings) {
      if (
        booking.paymentStatus === "pending_verification" ||
        booking.paymentStatus === "correction_requested"
      ) {
        receiptsPending += 1;
      }
      if (
        booking.paymentStatus === "awaiting_payment" &&
        booking.bookingStatus === "reserved"
      ) {
        awaitingPayment += 1;
      }
    }

    const deadline = await getRegistrationDeadline(ctx);
    return { bookings, publishedRooms, receiptsPending, awaitingPayment, deadline };
  },
});
