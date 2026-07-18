import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  REGION_CONFIG,
  type RegistrationRegion,
} from "./lib/registrationConfig";
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

const tourItemValidator = v.object({
  packageId: v.id("tourPackages"),
  quantity: v.number(),
});

export const create = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    countryCode: v.string(),
    region: v.string(),
    groupName: v.optional(v.string()),
    items: v.array(tourItemValidator),
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

    if (!args.fullName.trim()) {
      throw new Error("Full name is required");
    }

    if (!args.email.trim()) {
      throw new Error("Email is required");
    }

    if (!args.phone.trim()) {
      throw new Error("Phone is required");
    }

    const regionConfig = REGION_CONFIG[args.region as RegistrationRegion];
    if (!regionConfig) {
      throw new Error("Invalid region selected");
    }

    if (args.items.length === 0) {
      throw new Error("Select at least one tour package");
    }

    const seen = new Set<string>();
    const lineItems: {
      packageId: Id<"tourPackages">;
      label: string;
      quantity: number;
      unitPrice: number;
    }[] = [];
    let grandTotal = 0;

    for (const item of args.items) {
      if (seen.has(item.packageId)) {
        throw new Error("Duplicate tour package in order");
      }
      seen.add(item.packageId);

      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new Error("Ticket quantities must be whole numbers of at least 1");
      }

      const pkg = await ctx.db.get(item.packageId);
      if (!pkg || !pkg.active) {
        throw new Error("One or more selected tour packages are unavailable");
      }

      lineItems.push({
        packageId: pkg._id,
        label: `${pkg.label}: ${pkg.dateLabel}`,
        quantity: item.quantity,
        unitPrice: pkg.priceUsd,
      });
      grandTotal += pkg.priceUsd * item.quantity;
    }

    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "tour",
      "tourOrders",
    );

    const tourOrderId = await ctx.db.insert("tourOrders", {
      fullName: args.fullName.trim(),
      email: args.email.trim().toLowerCase(),
      phone: args.phone.trim(),
      countryCode: args.countryCode.trim(),
      region: args.region,
      groupName: args.groupName?.trim() || undefined,
      items: lineItems,
      totalAmount: grandTotal,
      currency: "USD",
      gateway: regionConfig.gateway,
      paymentStatus: args.mockPayment ? "mock_paid" : "pending_payment",
      paymentReference: args.mockPayment
        ? `MOCK-TOUR-${Date.now()}`
        : undefined,
      referenceNumber,
      consent: args.consent,
      createdAt: Date.now(),
    });

    if (args.mockPayment) {
      await queuePaymentConfirmation(ctx, "tour", tourOrderId, "mock_paid");
    }

    return {
      id: tourOrderId,
      referenceNumber,
      totalAmount: grandTotal,
      currency: "USD" as const,
      gateway: regionConfig.gateway,
    };
  },
});

export const list = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    return await ctx.db
      .query("tourOrders")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { sessionToken: sessionTokenValidator, id: v.id("tourOrders") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    return await ctx.db.get(args.id);
  },
});

export const updatePaymentStatus = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    id: v.id("tourOrders"),
    paymentStatus: paymentStatusValidator,
    paymentReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
    ]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Tour order not found");

    await ctx.db.patch(args.id, {
      paymentStatus: args.paymentStatus,
      paymentReference: args.paymentReference,
    });

    await queuePaymentConfirmation(
      ctx,
      "tour",
      args.id,
      args.paymentStatus,
      existing.paymentStatus,
    );

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "tour.payment_status",
      entityType: "tourOrders",
      entityId: args.id,
      summary: `Set tour order ${existing.referenceNumber ?? args.id} to ${args.paymentStatus}`,
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
    ids: v.array(v.id("tourOrders")),
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
        "tour",
        id,
        args.paymentStatus,
        existing.paymentStatus,
      );
      updated += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "tour.bulk_payment_status",
      entityType: "tourOrders",
      summary: `Bulk set ${updated} tour order(s) to ${args.paymentStatus}`,
      metadata: { count: updated, status: args.paymentStatus },
    });

    return { updated };
  },
});
