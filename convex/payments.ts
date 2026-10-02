import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { queuePaymentConfirmation } from "./lib/paymentEmail";
import { confirmBookingInventory } from "./agcAccommodation";

const checkoutTypeValidator = v.union(
  v.literal("registration"),
  v.literal("booking"),
  v.literal("tour"),
  v.literal("agc_registration"),
  v.literal("agc_booking"),
);

export const getCheckoutRecord = internalQuery({
  args: {
    type: checkoutTypeValidator,
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.type === "agc_registration") {
      const record = await ctx.db.get(args.recordId as Id<"agcRegistrations">);
      if (!record) return null;
      const hub = record.hubId
        ? await ctx.db.get(record.hubId)
        : null;
      return {
        type: "agc_registration" as const,
        recordId: record._id,
        email: record.contactEmail ?? "",
        totalAmount: record.totalAmount,
        currency: record.currency,
        gateway: record.paymentMode,
        paymentStatus: record.paymentStatus,
        paymentReference: record.paymentReference,
        referenceNumber: record.referenceNumber,
        description: `Homecoming 2026 registration × ${record.quantity} (${hub?.name ?? "hub"})`,
      };
    }

    if (args.type === "agc_booking") {
      const record = await ctx.db.get(args.recordId as Id<"agcBookings">);
      if (!record) return null;
      const hub = record.hubId ? await ctx.db.get(record.hubId) : null;
      return {
        type: "agc_booking" as const,
        recordId: record._id,
        email: record.contactEmail ?? "",
        totalAmount: record.totalAmount,
        currency: record.currency,
        gateway: record.paymentMode,
        paymentStatus: record.paymentStatus,
        paymentReference: record.paymentReference,
        referenceNumber: record.referenceNumber,
        description: `Homecoming 2026 accommodation (${hub?.name ?? "hub"})`,
      };
    }

    if (args.type === "registration") {
      const record = await ctx.db.get(args.recordId as Id<"registrations">);
      if (!record) return null;
      return {
        type: "registration" as const,
        recordId: record._id,
        email: record.email,
        totalAmount: record.totalAmount,
        currency: record.currency,
        gateway: record.gateway,
        paymentStatus: record.paymentStatus,
        paymentReference: record.paymentReference,
        referenceNumber: record.referenceNumber,
        description: "Homecoming registration",
      };
    }

    if (args.type === "booking") {
      const record = await ctx.db.get(args.recordId as Id<"housingBookings">);
      if (!record) return null;
      return {
        type: "booking" as const,
        recordId: record._id,
        email: record.guestEmail,
        totalAmount: record.totalAmount,
        currency: record.currency,
        gateway: record.gateway,
        paymentStatus: record.paymentStatus,
        paymentReference: record.paymentReference,
        referenceNumber: record.referenceNumber,
        description: `Campus accommodation (${record.housingType})`,
      };
    }

    const record = await ctx.db.get(args.recordId as Id<"tourOrders">);
    if (!record) return null;
    return {
      type: "tour" as const,
      recordId: record._id,
      email: record.email,
      totalAmount: record.totalAmount,
      currency: record.currency,
      gateway: record.gateway,
      paymentStatus: record.paymentStatus,
      paymentReference: record.paymentReference,
      referenceNumber: record.referenceNumber,
      description: "Homecoming tour tickets",
    };
  },
});

export const setPaymentReference = internalMutation({
  args: {
    type: checkoutTypeValidator,
    recordId: v.string(),
    paymentReference: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.type === "agc_registration") {
      await ctx.db.patch(args.recordId as Id<"agcRegistrations">, {
        paymentReference: args.paymentReference,
      });
      return;
    }
    if (args.type === "agc_booking") {
      await ctx.db.patch(args.recordId as Id<"agcBookings">, {
        paymentReference: args.paymentReference,
      });
      return;
    }
    if (args.type === "registration") {
      await ctx.db.patch(args.recordId as Id<"registrations">, {
        paymentReference: args.paymentReference,
      });
      return;
    }
    if (args.type === "booking") {
      await ctx.db.patch(args.recordId as Id<"housingBookings">, {
        paymentReference: args.paymentReference,
      });
      return;
    }
    await ctx.db.patch(args.recordId as Id<"tourOrders">, {
      paymentReference: args.paymentReference,
    });
  },
});

export const applyMockPayment = internalMutation({
  args: {
    type: checkoutTypeValidator,
    recordId: v.string(),
    reference: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.type === "agc_registration") {
      const recordId = args.recordId as Id<"agcRegistrations">;
      const existing = await ctx.db.get(recordId);
      if (!existing) throw new ConvexError("Registration not found");
      await ctx.db.patch(recordId, {
        paymentStatus: "confirmed",
        paymentReference: args.reference,
        paidAt: Date.now(),
        confirmedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    }

    if (args.type === "agc_booking") {
      const recordId = args.recordId as Id<"agcBookings">;
      const existing = await ctx.db.get(recordId);
      if (!existing) throw new ConvexError("Booking not found");
      await ctx.db.patch(recordId, {
        paymentStatus: "confirmed",
        paymentReference: args.reference,
        paidAt: Date.now(),
        confirmedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await confirmBookingInventory(ctx, recordId);
      return;
    }

    if (args.type === "registration") {
      const existing = await ctx.db.get(args.recordId as Id<"registrations">);
      if (!existing) throw new ConvexError("Registration not found");
      await ctx.db.patch(args.recordId as Id<"registrations">, {
        paymentStatus: "mock_paid",
        paymentReference: args.reference,
      });
      await queuePaymentConfirmation(
        ctx,
        "registration",
        args.recordId,
        "mock_paid",
        existing.paymentStatus,
      );
      return;
    }

    if (args.type === "booking") {
      const existing = await ctx.db.get(args.recordId as Id<"housingBookings">);
      if (!existing) throw new ConvexError("Booking not found");
      await ctx.db.patch(args.recordId as Id<"housingBookings">, {
        paymentStatus: "mock_paid",
        paymentReference: args.reference,
      });
      await queuePaymentConfirmation(
        ctx,
        "booking",
        args.recordId,
        "mock_paid",
        existing.paymentStatus,
      );
      return;
    }

    const existing = await ctx.db.get(args.recordId as Id<"tourOrders">);
    if (!existing) throw new ConvexError("Tour order not found");
    await ctx.db.patch(args.recordId as Id<"tourOrders">, {
      paymentStatus: "mock_paid",
      paymentReference: args.reference,
    });
    await queuePaymentConfirmation(
      ctx,
      "tour",
      args.recordId,
      "mock_paid",
      existing.paymentStatus,
    );
  },
});

/** @deprecated Prefer Stripe Checkout via stripeCheckout.createCheckoutSession */
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
    type: checkoutTypeValidator,
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const paymentStatus = args.status === "paid" ? "paid" : "failed";

    if (args.type === "agc_registration") {
      const recordId = args.recordId as Id<"agcRegistrations">;
      const existing = await ctx.db.get(recordId);
      if (!existing) return;
      if (existing.paymentStatus === "confirmed") return;
      if (args.status === "failed") return;
      await ctx.db.patch(recordId, {
        paymentStatus: "confirmed",
        paymentReference: args.reference,
        paidAt: Date.now(),
        confirmedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return;
    }

    if (args.type === "agc_booking") {
      const recordId = args.recordId as Id<"agcBookings">;
      const existing = await ctx.db.get(recordId);
      if (!existing) return;
      if (existing.bookingStatus === "confirmed") return;
      if (args.status === "failed") return;
      await ctx.db.patch(recordId, {
        paymentStatus: "confirmed",
        paymentReference: args.reference,
        paidAt: Date.now(),
        confirmedAt: Date.now(),
        bookingStatus: "confirmed",
        expiresAt: undefined,
        updatedAt: Date.now(),
      });
      await confirmBookingInventory(ctx, recordId);
      return;
    }

    if (args.type === "registration") {
      const recordId = args.recordId as Id<"registrations">;
      const existing = await ctx.db.get(recordId);
      if (!existing) return;
      if (
        existing.paymentStatus === "paid" ||
        existing.paymentStatus === "mock_paid"
      ) {
        return;
      }
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
          existing.paymentStatus,
        );
      }
    } else if (args.type === "booking") {
      const recordId = args.recordId as Id<"housingBookings">;
      const existing = await ctx.db.get(recordId);
      if (!existing) return;
      if (
        existing.paymentStatus === "paid" ||
        existing.paymentStatus === "mock_paid"
      ) {
        return;
      }
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
          existing.paymentStatus,
        );
      }
    } else {
      const recordId = args.recordId as Id<"tourOrders">;
      const existing = await ctx.db.get(recordId);
      if (!existing) return;
      if (
        existing.paymentStatus === "paid" ||
        existing.paymentStatus === "mock_paid"
      ) {
        return;
      }
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
          existing.paymentStatus,
        );
      }
    }
  },
});
