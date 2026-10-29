import { v } from "convex/values";
import { ConvexError } from "convex/values";
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

/**
 * Items are identified by package slug (the manifest's stable key): the
 * public page renders from the repo-hosted manifest and has no Convex ids.
 * Prices are ALWAYS re-resolved from the database here, so a stale or
 * tampered manifest cannot change what an order costs.
 */
const tourItemValidator = v.object({
  packageSlug: v.string(),
  quantity: v.number(),
});

/** Uploads land in storage first; these are the limits we enforce on attach. */
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export const create = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    countryCode: v.string(),
    region: v.string(),
    groupName: v.string(),
    denomination: v.string(),
    church: v.optional(v.string()),
    items: v.array(tourItemValidator),
    /** Historical stripe/paypal values were accepted before the offline switch. */
    gateway: v.optional(v.union(v.literal("stripe"), v.literal("paypal"))),
    consent: v.boolean(),
    honeypot: v.optional(v.string()),
    mockPayment: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.honeypot?.trim()) {
      throw new ConvexError("Invalid submission");
    }

    if (!args.consent) {
      throw new ConvexError("Consent is required");
    }

    if (!args.fullName.trim()) {
      throw new ConvexError("Full name is required");
    }

    if (!args.email.trim()) {
      throw new ConvexError("Email is required");
    }

    if (!args.phone.trim()) {
      throw new ConvexError("Phone is required");
    }

    if (!args.groupName?.trim()) {
      throw new ConvexError("Group is required");
    }

    if (!args.denomination?.trim()) {
      throw new ConvexError("Denomination is required");
    }

    const regionConfig = REGION_CONFIG[args.region as RegistrationRegion];
    if (!regionConfig) {
      throw new ConvexError("Invalid region selected");
    }

    if (args.items.length === 0) {
      throw new ConvexError("Select at least one tour package");
    }

    const allPackages = await ctx.db.query("tourPackages").collect();
    const bySlug = new Map(allPackages.map((pkg) => [pkg.slug, pkg]));

    const seen = new Set<string>();
    const lineItems: {
      packageId: Id<"tourPackages">;
      label: string;
      quantity: number;
      unitPrice: number;
    }[] = [];
    let grandTotal = 0;

    for (const item of args.items) {
      if (seen.has(item.packageSlug)) {
        throw new ConvexError("Duplicate tour package in order");
      }
      seen.add(item.packageSlug);

      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new ConvexError("Ticket quantities must be whole numbers of at least 1");
      }

      const pkg = bySlug.get(item.packageSlug);
      if (!pkg || !pkg.active) {
        throw new ConvexError("One or more selected tour packages are unavailable");
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
      groupName: args.groupName.trim(),
      denomination: args.denomination.trim(),
      church: args.church?.trim() || undefined,
      items: lineItems,
      totalAmount: grandTotal,
      currency: "USD",
      // Stripe removed — tour orders are paid offline via bank instructions.
      gateway: "offline",
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
      gateway: args.gateway,
    };
  },
});

export const list = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "registration"]);
    const orders = await ctx.db
      .query("tourOrders")
      .withIndex("by_created_at")
      .order("desc")
      .collect();

    // Resolve the receipt URL here so the dashboard can show the payment
    // evidence without a second round trip per row.
    return Promise.all(
      orders.map(async (order) => ({
        ...order,
        receiptUrl: order.receiptStorageId
          ? ((await ctx.storage.getUrl(order.receiptStorageId)) ?? null)
          : null,
      })),
    );
  },
});

/**
 * Public: guests upload their receipt straight after booking, so there is no
 * signed-in actor to authorise here. `attachReceipt` then matches the file to
 * an order by reference number *and* the email the order was placed with, so
 * knowing a reference alone is not enough to touch someone's order.
 */
export const generateReceiptUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const attachReceipt = mutation({
  args: {
    referenceNumber: v.string(),
    email: v.string(),
    storageId: v.id("_storage"),
    /** Declared type, used only when storage recorded none for the blob. */
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const reference = args.referenceNumber.trim().toUpperCase();
    if (!email || !reference) {
      throw new ConvexError("Reference number and email are required");
    }

    const candidates = await ctx.db
      .query("tourOrders")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const order = candidates.find(
      (row) => (row.referenceNumber ?? "").toUpperCase() === reference,
    );
    if (!order) {
      throw new ConvexError(
        "We could not match that reference number to this email address",
      );
    }

    // Read the uploaded blob's real type/size from the system table rather
    // than trusting what the client says it uploaded. Storage always records
    // size; it records the content type too on the real runtime, but some
    // environments store a bare blob, so fall back to the declared type only
    // when the record has none.
    const file = await ctx.db.system.get(args.storageId);
    if (!file) throw new ConvexError("That upload could not be found");
    const type = (file.contentType || args.contentType || "").toLowerCase();
    const allowed = type.startsWith("image/") || type === "application/pdf";
    if (!allowed) {
      throw new ConvexError("Upload a photo or PDF of your receipt");
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new ConvexError("Receipt must be smaller than 8 MB");
    }

    // Replacing a receipt: drop the previous blob once it is no longer
    // referenced, ignoring files the dashboard already removed.
    if (order.receiptStorageId && order.receiptStorageId !== args.storageId) {
      if (await ctx.storage.getUrl(order.receiptStorageId)) {
        await ctx.storage.delete(order.receiptStorageId);
      }
    }

    await ctx.db.patch(order._id, {
      receiptStorageId: args.storageId,
      receiptUploadedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorEmail: email,
      action: "tour.receipt_upload",
      entityType: "tourOrders",
      entityId: order._id,
      summary: `Receipt uploaded for tour order ${order.referenceNumber ?? order._id}`,
      metadata: { size: file.size, contentType: file.contentType },
    });

    return { uploadedAt: Date.now() };
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
    if (!existing) throw new ConvexError("Tour order not found");

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
