import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { queuePaymentConfirmation } from "./lib/paymentEmail";

export const initiatePaystackPayment = mutation({
  args: {
    registrationId: v.optional(v.id("registrations")),
    bookingId: v.optional(v.id("housingBookings")),
    tourOrderId: v.optional(v.id("tourOrders")),
    email: v.string(),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const reference = `PAYSTACK-${Date.now()}`;
    const paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY;

    if (!paystackPublicKey || paystackPublicKey === "pk_test_placeholder") {
      if (args.registrationId) {
        const existing = await ctx.db.get(args.registrationId);
        await ctx.db.patch(args.registrationId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
        if (existing) {
          await queuePaymentConfirmation(
            ctx,
            "registration",
            args.registrationId,
            "mock_paid",
            existing.paymentStatus,
          );
        }
      }
      if (args.bookingId) {
        const existing = await ctx.db.get(args.bookingId);
        await ctx.db.patch(args.bookingId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
        if (existing) {
          await queuePaymentConfirmation(
            ctx,
            "booking",
            args.bookingId,
            "mock_paid",
            existing.paymentStatus,
          );
        }
      }
      if (args.tourOrderId) {
        const existing = await ctx.db.get(args.tourOrderId);
        await ctx.db.patch(args.tourOrderId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
        if (existing) {
          await queuePaymentConfirmation(
            ctx,
            "tour",
            args.tourOrderId,
            "mock_paid",
            existing.paymentStatus,
          );
        }
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
    tourOrderId: v.optional(v.id("tourOrders")),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const reference = `PAYPAL-${Date.now()}`;
    const paypalClientId = process.env.PAYPAL_CLIENT_ID;

    if (!paypalClientId || paypalClientId === "paypal_client_id_placeholder") {
      if (args.registrationId) {
        const existing = await ctx.db.get(args.registrationId);
        await ctx.db.patch(args.registrationId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
        if (existing) {
          await queuePaymentConfirmation(
            ctx,
            "registration",
            args.registrationId,
            "mock_paid",
            existing.paymentStatus,
          );
        }
      }
      if (args.bookingId) {
        const existing = await ctx.db.get(args.bookingId);
        await ctx.db.patch(args.bookingId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
        if (existing) {
          await queuePaymentConfirmation(
            ctx,
            "booking",
            args.bookingId,
            "mock_paid",
            existing.paymentStatus,
          );
        }
      }
      if (args.tourOrderId) {
        const existing = await ctx.db.get(args.tourOrderId);
        await ctx.db.patch(args.tourOrderId, {
          paymentStatus: "mock_paid",
          paymentReference: reference,
        });
        if (existing) {
          await queuePaymentConfirmation(
            ctx,
            "tour",
            args.tourOrderId,
            "mock_paid",
            existing.paymentStatus,
          );
        }
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
    type: v.union(
      v.literal("registration"),
      v.literal("booking"),
      v.literal("tour"),
    ),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const paymentStatus = args.status === "paid" ? "paid" : "failed";

    if (args.type === "registration") {
      const recordId = args.recordId as Id<"registrations">;
      const existing = await ctx.db.get(recordId);
      await ctx.db.patch(recordId, {
        paymentStatus,
        paymentReference: args.reference,
      });
      if (args.status === "paid") {
        await queuePaymentConfirmation(
          ctx,
          "registration",
          args.recordId,
          "paid",
          existing?.paymentStatus,
        );
      }
    } else if (args.type === "booking") {
      const recordId = args.recordId as Id<"housingBookings">;
      const existing = await ctx.db.get(recordId);
      await ctx.db.patch(recordId, {
        paymentStatus,
        paymentReference: args.reference,
      });
      if (args.status === "paid") {
        await queuePaymentConfirmation(
          ctx,
          "booking",
          args.recordId,
          "paid",
          existing?.paymentStatus,
        );
      }
    } else {
      const recordId = args.recordId as Id<"tourOrders">;
      const existing = await ctx.db.get(recordId);
      await ctx.db.patch(recordId, {
        paymentStatus,
        paymentReference: args.reference,
      });
      if (args.status === "paid") {
        await queuePaymentConfirmation(
          ctx,
          "tour",
          args.recordId,
          "paid",
          existing?.paymentStatus,
        );
      }
    }
  },
});
