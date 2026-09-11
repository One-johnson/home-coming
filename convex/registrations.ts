import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createUniqueReferenceNumber } from "./lib/referenceNumbers";
import { writeAuditLog } from "./lib/audit";
import { queuePaymentConfirmation } from "./lib/paymentEmail";
import { resolveGroupPricing } from "./registrationCatalog";
import { requireRole, sessionTokenValidator } from "./users";

const paymentStatusValidator = v.union(
  v.literal("pending_payment"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("mock_paid"),
);

const gatewayValidator = v.union(
  v.literal("stripe"),
  v.literal("paystack"),
  v.literal("paypal"),
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
    /** Ignored while add-ons are disabled; kept optional for older clients. */
    addOns: v.optional(v.array(addOnSelectionValidator)),
    accommodationInterest: v.boolean(),
    priceAmount: v.optional(v.number()),
    addOnAmount: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    gateway: v.optional(gatewayValidator),
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

    const group = args.group?.trim();
    if (!group) {
      throw new Error("Group is required");
    }

    const pricing = await resolveGroupPricing(ctx, group);
    const amounts = {
      priceAmount: pricing.price * args.ticketQuantity,
      addOnAmount: 0,
      totalAmount: pricing.price * args.ticketQuantity,
      currency: pricing.currency,
      gateway: pricing.gateway,
      regionKey: pricing.regionKey,
    };

    // GHS tickets are Paystack-only — Stripe cannot charge GHS on US accounts.
    const gateway: "paystack" | "stripe" =
      amounts.currency === "GHS"
        ? "paystack"
        : args.gateway === "stripe" || args.gateway === "paystack"
          ? args.gateway
          : amounts.gateway === "paystack"
            ? "paystack"
            : "stripe";

    if (gateway === "stripe" && amounts.currency === "GHS") {
      throw new Error(
        "Stripe cannot charge GHS. Use Paystack for Ghana cedi pricing.",
      );
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
      region: pricing.regionKey,
      group,
      denomination: args.denomination?.trim() || undefined,
      church: args.church?.trim() || undefined,
      ticketQuantity: args.ticketQuantity,
      addOns: [],
      accommodationInterest: args.accommodationInterest,
      priceAmount: amounts.priceAmount,
      addOnAmount: 0,
      totalAmount: amounts.totalAmount,
      currency: amounts.currency,
      gateway,
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

    return {
      id: registrationId,
      referenceNumber,
      totalAmount: amounts.totalAmount,
      currency: amounts.currency,
      gateway,
    };
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

export const remove = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("registrations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Registration not found");

    await ctx.db.delete(args.id);

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration.deleted",
      entityType: "registrations",
      entityId: args.id,
      summary: `Deleted registration ${existing.referenceNumber ?? args.id} (${existing.email})`,
      metadata: {
        referenceNumber: existing.referenceNumber,
        email: existing.email,
        paymentStatus: existing.paymentStatus,
      },
    });
  },
});

export const bulkRemove = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("registrations")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    if (args.ids.length === 0) {
      throw new Error("Select at least one registration");
    }

    let deleted = 0;
    for (const id of args.ids) {
      const existing = await ctx.db.get(id);
      if (!existing) continue;
      await ctx.db.delete(id);
      deleted += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "registration.bulk_deleted",
      entityType: "registrations",
      summary: `Deleted ${deleted} registration${deleted === 1 ? "" : "s"}`,
      metadata: { count: deleted },
    });

    return { deleted };
  },
});
