import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { REGION_CONFIG, type RegistrationRegion } from "./lib/registrationConfig";
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

const addOnSelectionValidator = v.object({
  id: v.string(),
  quantity: v.number(),
});

export const create = mutation({
  args: {
    type: v.union(v.literal("individual"), v.literal("group")),
    fullName: v.optional(v.string()),
    email: v.string(),
    phone: v.string(),
    countryCode: v.string(),
    region: v.string(),
    group: v.optional(v.string()),
    denomination: v.optional(v.string()),
    church: v.optional(v.string()),
    ticketQuantity: v.number(),
    addOns: v.array(addOnSelectionValidator),
    accommodationInterest: v.boolean(),
    priceAmount: v.number(),
    addOnAmount: v.number(),
    totalAmount: v.number(),
    currency: v.string(),
    gateway: v.union(v.literal("paystack"), v.literal("paypal")),
    consent: v.boolean(),
    honeypot: v.optional(v.string()),
    mockPayment: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.honeypot?.trim()) {
      throw new Error("Invalid submission");
    }

    if (!args.consent) {
      throw new Error("Consent is required");
    }

    if (args.type === "individual" && !args.fullName?.trim()) {
      throw new Error("Full name is required for individual registration");
    }

    if (args.ticketQuantity < 1) {
      throw new Error("Ticket quantity must be at least 1");
    }

    for (const addOn of args.addOns) {
      if (!Number.isInteger(addOn.quantity) || addOn.quantity < 1) {
        throw new Error("Add-on quantities must be whole numbers of at least 1");
      }
    }

    const regionConfig = REGION_CONFIG[args.region as RegistrationRegion];
    if (!regionConfig) {
      throw new Error("Invalid region selected");
    }

    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "registration",
      "registrations",
    );

    const registrationId = await ctx.db.insert("registrations", {
      type: args.type,
      fullName: args.fullName?.trim(),
      email: args.email.trim().toLowerCase(),
      phone: args.phone.trim(),
      countryCode: args.countryCode.trim(),
      region: args.region,
      group: args.group?.trim() || undefined,
      denomination: args.denomination?.trim() || undefined,
      church: args.church?.trim() || undefined,
      ticketQuantity: args.ticketQuantity,
      addOns: args.addOns,
      accommodationInterest: args.accommodationInterest,
      priceAmount: args.priceAmount,
      addOnAmount: args.addOnAmount,
      totalAmount: args.totalAmount,
      currency: args.currency,
      gateway: args.gateway,
      paymentStatus: args.mockPayment ? "mock_paid" : "pending_payment",
      paymentReference: args.mockPayment
        ? `MOCK-${Date.now()}`
        : undefined,
      referenceNumber,
      consent: args.consent,
      createdAt: Date.now(),
    });

    if (args.mockPayment) {
      await queuePaymentConfirmation(
        ctx,
        "registration",
        registrationId,
        "mock_paid",
      );
    }

    return { id: registrationId, referenceNumber };
  },
});

export const list = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    return await ctx.db
      .query("registrations")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { sessionToken: sessionTokenValidator, id: v.id("registrations") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    return await ctx.db.get(args.id);
  },
});

export const updatePaymentStatus = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("registrations"),
    paymentStatus: paymentStatusValidator,
    paymentReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Registration not found");

    await ctx.db.patch(args.id, {
      paymentStatus: args.paymentStatus,
      paymentReference: args.paymentReference,
    });

    await queuePaymentConfirmation(
      ctx,
      "registration",
      args.id,
      args.paymentStatus,
      existing.paymentStatus,
    );

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration.payment_status",
      entityType: "registrations",
      entityId: args.id,
      summary: `Set registration ${existing.referenceNumber ?? args.id} to ${args.paymentStatus}`,
      metadata: {
        previous: existing.paymentStatus,
        next: args.paymentStatus,
      },
    });
  },
});

export const bulkUpdatePaymentStatus = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("registrations")),
    paymentStatus: paymentStatusValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    let updated = 0;
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (!existing) continue;
      await ctx.db.patch(id, { paymentStatus: args.paymentStatus });
      await queuePaymentConfirmation(
        ctx,
        "registration",
        id,
        args.paymentStatus,
        existing.paymentStatus,
      );
      updated += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration.bulk_payment_status",
      entityType: "registrations",
      summary: `Bulk set ${updated} registration(s) to ${args.paymentStatus}`,
      metadata: { count: updated, status: args.paymentStatus },
    });

    return { updated };
  },
});
