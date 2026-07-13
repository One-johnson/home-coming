import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createUniqueReferenceNumber } from "./lib/referenceNumbers";
import { requireRole } from "./users";

export const listHousing = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("housing").collect();
  },
});

export const listBookings = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "accommodation"]);
    return await ctx.db
      .query("housingBookings")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const createBooking = mutation({
  args: {
    housingId: v.id("housing"),
    housingType: v.union(
      v.literal("condo"),
      v.literal("hostel"),
      v.literal("apartment"),
    ),
    guestName: v.string(),
    guestEmail: v.string(),
    guestPhone: v.string(),
    checkIn: v.string(),
    checkOut: v.string(),
    guests: v.number(),
    notes: v.optional(v.string()),
    mockPayment: v.optional(v.boolean()),
    honeypot: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.honeypot?.trim()) {
      throw new Error("Invalid submission");
    }

    const housing = await ctx.db.get(args.housingId);
    if (!housing) {
      throw new Error("Housing option not found");
    }

    if (housing.booked >= housing.capacityLimit) {
      throw new Error("No availability remaining for this housing type");
    }

    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "stay",
      "housingBookings",
    );

    const bookingId = await ctx.db.insert("housingBookings", {
      housingId: args.housingId,
      housingType: args.housingType,
      guestName: args.guestName.trim(),
      guestEmail: args.guestEmail.trim().toLowerCase(),
      guestPhone: args.guestPhone.trim(),
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      guests: args.guests,
      pricePerStay: housing.pricePerStay,
      totalAmount: housing.pricePerStay,
      currency: "USD",
      paymentStatus: args.mockPayment ? "mock_paid" : "pending_payment",
      paymentReference: args.mockPayment ? `MOCK-HOUSING-${Date.now()}` : undefined,
      referenceNumber,
      notes: args.notes?.trim(),
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.housingId, {
      booked: housing.booked + 1,
    });

    await ctx.db.insert("emailLogs", {
      to: args.guestEmail.trim().toLowerCase(),
      subject: "Homecoming Accommodation Confirmation",
      body: `Thank you for booking ${housing.type} accommodation. Your booking reference is ${referenceNumber}.`,
      type: "accommodation_confirmation",
      referenceId: bookingId,
      status: "stub",
      createdAt: Date.now(),
    });

    return { id: bookingId, referenceNumber };
  },
});

export const updateHousingCapacity = mutation({
  args: {
    id: v.id("housing"),
    capacityLimit: v.number(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin", "accommodation"]);
    await ctx.db.patch(args.id, {
      capacityLimit: args.capacityLimit,
      notes: args.notes,
    });
  },
});
