import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createUniqueReferenceNumber } from "./lib/referenceNumbers";
import { writeAuditLog } from "./lib/audit";
import { queuePaymentConfirmation } from "./lib/paymentEmail";
import { requireRole, sessionTokenValidator } from "./users";

const paymentStatusValidator = v.union(
  v.literal("pending_payment"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("mock_paid"),
);

export const listHousing = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("housing").collect();
  },
});

export const listHousingAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "accommodation"]);
    return await ctx.db.query("housing").collect();
  },
});

export const listBookings = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "accommodation"]);
    return await ctx.db
      .query("housingBookings")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const getBookingById = query({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("housingBookings"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "accommodation"]);
    return await ctx.db.get(args.id);
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

    if (args.mockPayment) {
      await queuePaymentConfirmation(ctx, "booking", bookingId, "mock_paid");
    }

    return { id: bookingId, referenceNumber };
  },
});

export const updateHousing = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("housing"),
    capacityLimit: v.number(),
    pricePerStay: v.number(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Housing not found");
    if (args.capacityLimit < existing.booked) {
      throw new Error(
        `Capacity cannot be below current bookings (${existing.booked})`,
      );
    }
    if (args.pricePerStay < 0) {
      throw new Error("Price must be non-negative");
    }

    await ctx.db.patch(args.id, {
      capacityLimit: args.capacityLimit,
      pricePerStay: args.pricePerStay,
      notes: args.notes,
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "housing.updated",
      entityType: "housing",
      entityId: args.id,
      summary: `Updated ${existing.type} inventory`,
      metadata: {
        capacityLimit: args.capacityLimit,
        pricePerStay: args.pricePerStay,
      },
    });
  },
});

export const updateHousingCapacity = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("housing"),
    capacityLimit: v.number(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
    ]);
    const housing = await ctx.db.get(args.id);
    if (!housing) throw new Error("Housing not found");
    if (args.capacityLimit < housing.booked) {
      throw new Error(
        `Capacity cannot be below current bookings (${housing.booked})`,
      );
    }
    await ctx.db.patch(args.id, {
      capacityLimit: args.capacityLimit,
      notes: args.notes,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "housing.capacity_updated",
      entityType: "housing",
      entityId: args.id,
      summary: `Updated ${housing.type} capacity to ${args.capacityLimit}`,
    });
  },
});

export const updateBookingPaymentStatus = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("housingBookings"),
    paymentStatus: paymentStatusValidator,
    paymentReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Booking not found");

    await ctx.db.patch(args.id, {
      paymentStatus: args.paymentStatus,
      paymentReference: args.paymentReference,
    });

    await queuePaymentConfirmation(
      ctx,
      "booking",
      args.id,
      args.paymentStatus,
      existing.paymentStatus,
    );

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "booking.payment_status",
      entityType: "housingBookings",
      entityId: args.id,
      summary: `Set booking ${existing.referenceNumber ?? args.id} to ${args.paymentStatus}`,
      metadata: {
        previous: existing.paymentStatus,
        next: args.paymentStatus,
      },
    });
  },
});

export const bulkUpdateBookingPaymentStatus = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("housingBookings")),
    paymentStatus: paymentStatusValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
    ]);
    let updated = 0;
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (!existing) continue;
      await ctx.db.patch(id, { paymentStatus: args.paymentStatus });
      await queuePaymentConfirmation(
        ctx,
        "booking",
        id,
        args.paymentStatus,
        existing.paymentStatus,
      );
      updated += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "booking.bulk_payment_status",
      entityType: "housingBookings",
      summary: `Bulk set ${updated} booking(s) to ${args.paymentStatus}`,
      metadata: { count: updated, status: args.paymentStatus },
    });

    return { updated };
  },
});
