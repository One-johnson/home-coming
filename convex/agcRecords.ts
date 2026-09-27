import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { confirmBookingInventory } from "./agcAccommodation";

// ------------------------------------------------------------------
// Stripe checkout finalization for AGC records. Called from
// stripeCheckout.finalizeCheckoutSession and the Stripe webhook when
// metadata.type is agc_registration / agc_booking.
// ------------------------------------------------------------------

export const confirmAgcOnlinePayment = internalMutation({
  args: {
    reference: v.string(),
    type: v.union(
      v.literal("agc_registration"),
      v.literal("agc_booking"),
    ),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.type === "agc_registration") {
      const recordId = args.recordId as Id<"agcRegistrations">;
      const existing = await ctx.db.get(recordId);
      if (!existing || existing.paymentStatus === "confirmed") return;
      await ctx.db.patch(recordId, {
        paymentStatus: "confirmed",
        paymentReference: args.reference,
        paidAt: existing.paidAt ?? Date.now(),
        confirmedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    }

    const recordId = args.recordId as Id<"agcBookings">;
    const existing = await ctx.db.get(recordId);
    if (!existing || existing.bookingStatus === "confirmed") return;
    await ctx.db.patch(recordId, {
      paymentStatus: "confirmed",
      bookingStatus: "confirmed",
      paymentReference: args.reference,
      expiresAt: undefined,
      paidAt: existing.paidAt ?? Date.now(),
      confirmedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await confirmBookingInventory(ctx, recordId);
  },
});
