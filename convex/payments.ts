import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

export const initiatePaystackPayment = mutation({
  args: {
    registrationId: v.optional(v.id("registrations")),
    bookingId: v.optional(v.id("housingBookings")),
    email: v.string(),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const reference = `PAYSTACK-${Date.now()}`;
    const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY;

    if (!paystackPublicKey || paystackPublicKey === "pk_test_placeholder") {
      if (args.registrationId) {
        await ctx.db.patch(args.registrationId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
      }
      if (args.bookingId) {
        await ctx.db.patch(args.bookingId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
      }
      return {
        mode: "mock" as const,
        reference,
        message: "Paystack credentials not configured. Payment simulated.",
      };
    }

    return {
      mode: "live" as const,
      reference,
      publicKey: paystackPublicKey,
      amount: args.amount * 100,
      currency: args.currency,
      email: args.email,
    };
  },
});

export const initiatePaypalPayment = mutation({
  args: {
    registrationId: v.optional(v.id("registrations")),
    bookingId: v.optional(v.id("housingBookings")),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const reference = `PAYPAL-${Date.now()}`;
    const paypalClientId = process.env.PAYPAL_CLIENT_ID;

    if (!paypalClientId || paypalClientId === "paypal_client_id_placeholder") {
      if (args.registrationId) {
        await ctx.db.patch(args.registrationId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
      }
      if (args.bookingId) {
        await ctx.db.patch(args.bookingId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
      }
      return {
        mode: "mock" as const,
        reference,
        message: "PayPal credentials not configured. Payment simulated.",
      };
    }

    return {
      mode: "live" as const,
      reference,
      clientId: paypalClientId,
      amount: args.amount,
      currency: args.currency,
    };
  },
});

export const confirmPayment = internalMutation({
  args: {
    reference: v.string(),
    status: v.union(v.literal("paid"), v.literal("failed")),
    type: v.union(v.literal("registration"), v.literal("booking")),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const paymentStatus = args.status === "paid" ? "paid" : "failed";

    if (args.type === "registration") {
      await ctx.db.patch(args.recordId as never, {
        paymentStatus,
        paymentReference: args.reference,
      });
    } else {
      await ctx.db.patch(args.recordId as never, {
        paymentStatus,
        paymentReference: args.reference,
      });
    }
  },
});
