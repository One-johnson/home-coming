import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { REGION_CONFIG, type RegistrationRegion } from "./lib/registrationConfig";
import { createUniqueReferenceNumber } from "./lib/referenceNumbers";
import { requireRole } from "./users";

export const create = mutation({
  args: {
    type: v.union(v.literal("individual"), v.literal("group")),
    fullName: v.optional(v.string()),
    email: v.string(),
    phone: v.string(),
    countryCode: v.string(),
    region: v.string(),
    church: v.optional(v.string()),
    ticketQuantity: v.number(),
    addOns: v.array(v.string()),
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
      church: args.church?.trim(),
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

    await ctx.db.insert("emailLogs", {
      to: args.email.trim().toLowerCase(),
      subject: "Homecoming Registration Confirmation",
      body: `Thank you for registering for Mountain of the Lord — The Homecoming. Your registration reference is ${referenceNumber}. Payment status: ${args.mockPayment ? "Confirmed (mock)" : "Pending"}.`,
      type: "registration_confirmation",
      referenceId: registrationId,
      status: "stub",
      createdAt: Date.now(),
    });

    return { id: registrationId, referenceNumber };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin", "registration"]);
    return await ctx.db
      .query("registrations")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("registrations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updatePaymentStatus = mutation({
  args: {
    id: v.id("registrations"),
    paymentStatus: v.union(
      v.literal("pending_payment"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("mock_paid"),
    ),
    paymentReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      paymentStatus: args.paymentStatus,
      paymentReference: args.paymentReference,
    });
  },
});
