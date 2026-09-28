import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  AGC_DEFAULTS,
  AGC_REGIONS,
  AGC_SETTING_KEYS,
  regionPricing,
} from "./lib/agcConfig";
import { agcOfflinePayment } from "./schemaTypes";
import { isSmtpConfigured } from "./lib/smtpConfig";
import { writeAuditLog } from "./lib/audit";
import { createUniqueReferenceNumber } from "./lib/referenceNumbers";

// ------------------------------------------------------------------
// Session helpers — reps authenticate with a token in agcRepSessions
// ------------------------------------------------------------------

export async function getRepByToken(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<{ rep: Doc<"agcRepresentatives">; hub: Doc<"agcHubs"> } | null> {
  if (!token?.trim()) return null;

  const session = await ctx.db
    .query("agcRepSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) return null;

  const rep = await ctx.db.get(session.repId);
  if (!rep || rep.status === "disabled") return null;

  const hub = await ctx.db.get(rep.hubId);
  if (!hub) return null;

  return { rep, hub };
}

export async function requireRep(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<{ rep: Doc<"agcRepresentatives">; hub: Doc<"agcHubs"> }> {
  const result = await getRepByToken(ctx, token);
  if (!result) throw new Error("Unauthorized");
  return result;
}

// ------------------------------------------------------------------
// Deadline (SRS §14, §55)
// ------------------------------------------------------------------

export async function getRegistrationDeadline(ctx: QueryCtx): Promise<number> {
  const setting = await ctx.db
    .query("agcSettings")
    .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.deadline))
    .unique();
  if (!setting) {
    return new Date(AGC_DEFAULTS.deadline).getTime();
  }
  const parsed = new Date(setting.value).getTime();
  return Number.isNaN(parsed)
    ? new Date(AGC_DEFAULTS.deadline).getTime()
    : parsed;
}

export async function assertBeforeDeadline(ctx: MutationCtx) {
  const deadline = await getRegistrationDeadline(ctx);
  if (Date.now() > deadline) {
    throw new Error(
      "The registration deadline has passed. Contact the registration desk for assistance.",
    );
  }
}

// ------------------------------------------------------------------
// Rep queries
// ------------------------------------------------------------------

export const getRepProfile = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    // Returns null (never throws) for missing/expired sessions so the client
    // provider can cleanly clear the stale token and show the sign-in form.
    const result = await getRepByToken(ctx, args.sessionToken);
    if (!result) return null;
    const { rep, hub } = result;
    return {
      _id: rep._id,
      username: rep.username,
      hubId: rep.hubId,
      hubName: hub.name,
      hubRegion: hub.region,
      country: hub.country,
      firstName: rep.firstName ?? "",
      lastName: rep.lastName ?? "",
      email: rep.email ?? "",
      phone: rep.phone ?? "",
      profileComplete: rep.profileComplete,
      createdAt: rep.createdAt,
    };
  },
});

export const updateRepProfile = mutation({
  args: {
    sessionToken: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const { rep } = await requireRep(ctx, args.sessionToken);

    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("A valid email address is required");
    }

    const emailTaken = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (emailTaken && emailTaken._id !== rep._id) {
      throw new Error("This email address is already in use");
    }

    await ctx.db.patch(rep._id, {
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      email,
      phone: args.phone.trim(),
      profileComplete: true,
      updatedAt: Date.now(),
    });
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Public config for the portal UI (pricing, deadline, bank details)
// ------------------------------------------------------------------

export const getPortalConfig = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("agcSettings").collect();
    const map = new Map(settings.map((row) => [row.key, row.value]));
    return {
      deadline: map.get(AGC_SETTING_KEYS.deadline) ?? AGC_DEFAULTS.deadline,
      registrationBankDetails:
        map.get(AGC_SETTING_KEYS.registrationBank) ?? "",
      accommodationBankDetails:
        map.get(AGC_SETTING_KEYS.accommodationBank) ?? "",
      regions: Object.entries(AGC_REGIONS).map(([key, value]) => ({
        region: key,
        ...value,
      })),
    };
  },
});

// ------------------------------------------------------------------
// Rep registrations (SRS §9–16)
// ------------------------------------------------------------------

export const listRepRegistrations = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { rep } = await requireRep(ctx, args.sessionToken);
    const registrations = await ctx.db
      .query("agcRegistrations")
      .withIndex("by_rep", (q) => q.eq("repId", rep._id))
      .collect();
    const result = [];
    for (const record of registrations) {
      const receiptUrl = record.offline?.receiptStorageId
        ? ((await ctx.storage.getUrl(record.offline.receiptStorageId)) ?? null)
        : null;
      result.push({
        _id: record._id,
        referenceNumber: record.referenceNumber ?? "",
        quantity: record.quantity,
        unitPrice: record.unitPrice,
        currency: record.currency,
        totalAmount: record.totalAmount,
        paymentMode: record.paymentMode,
        paymentStatus: record.paymentStatus,
        adminMessage: record.adminMessage ?? null,
        offline: record.offline ?? null,
        receiptUrl,
        createdAt: record.createdAt,
        paidAt: record.paidAt ?? null,
      });
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Rep uploads a receipt — generate a storage URL scoped to the rep session. */
export const generateReceiptUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireRep(ctx, args.sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submitOfflineRegistration = mutation({
  args: {
    sessionToken: v.string(),
    quantity: v.number(),
    offline: agcOfflinePayment,
  },
  handler: async (ctx, args) => {
    await assertBeforeDeadline(ctx);
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    if (rep.status !== "active") {
      throw new Error("This account is not active yet");
    }
    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new Error("Quantity must be a whole number of at least 1");
    }

    const pricing = regionPricing(hub.region);
    if (pricing.online) {
      throw new Error(
        "Your hub pays online with Stripe or PayPal — no receipt upload needed.",
      );
    }

    const receiptUrl = await ctx.storage.getUrl(
      args.offline.receiptStorageId as Id<"_storage">,
    );

    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "registration",
      "agcRegistrations",
    );

    const registrationId: Id<"agcRegistrations"> = await ctx.db.insert(
      "agcRegistrations",
      {
        hubId: hub._id,
        repId: rep._id,
        region: hub.region,
        contactEmail: rep.email ?? undefined,
        contactPhone: rep.phone ?? undefined,
        quantity: args.quantity,
        unitPrice: pricing.price,
        currency: pricing.currency,
        totalAmount: pricing.price * args.quantity,
        paymentMode: "offline",
        paymentStatus: "pending_verification",
        offline: {
          ...args.offline,
          receiptFileName: args.offline.receiptFileName ?? undefined,
          receiptContentType: args.offline.receiptContentType ?? undefined,
          // Server clock — clients are not trusted for timestamps.
          submittedAt: Date.now(),
        },
        referenceNumber,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    );

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_registration.offline_submitted",
      entityType: "agcRegistrations",
      entityId: registrationId,
      summary: `Hub ${hub.name} submitted ${args.quantity} registration(s) (${referenceNumber}) for manual review`,
      metadata: {
        quantity: args.quantity,
        amount: pricing.price * args.quantity,
        currency: pricing.currency,
        method: args.offline.method,
      },
    });

    // Notify platform admins that a payment awaits review (stub-safe).
    const adminNotify = await ctx.runMutation(
      internal.agcAdminData.notifyAdminsOfPendingReview,
      {
        kind: "registration",
        referenceNumber,
        hubName: hub.name,
        amount: pricing.price * args.quantity,
        currency: pricing.currency,
        recordId: registrationId,
      },
    );
    for (const entry of adminNotify) {
      if (entry.shouldSend) {
        await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
          emailLogId: entry.emailLogId,
        });
      }
    }

    // Notify the rep that finance will review the receipt (§50; stub-safe).
    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    if (rep.email) {
      const emailLogId: Id<"emailLogs"> = await ctx.db.insert("emailLogs", {
        to: rep.email,
        subject: `Homecoming 2026 — receipt received (${referenceNumber})`,
        body: [
          `Hello ${rep.firstName ?? rep.username},`,
          "",
          `We have received your payment receipt for ${args.quantity} registration(s), reference ${referenceNumber}.`,
          "Our finance team will review it and you will receive a confirmation email once it is approved.",
          "",
          "— Homecoming 2026 Registration Desk",
        ].join("\n"),
        type: "agc_registration_receipt_received",
        referenceId: registrationId,
        status,
        createdAt: Date.now(),
      });
      if (status === "pending") {
        await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
          emailLogId,
        });
      }
    }

    return { registrationId, referenceNumber, receiptUrl };
  },
});

/** Online (Stripe/PayPal) registration purchase — checkout happens next. */
export const createOnlineRegistration = mutation({
  args: {
    sessionToken: v.string(),
    quantity: v.number(),
    paymentMode: v.union(v.literal("stripe"), v.literal("paypal")),
  },
  handler: async (ctx, args) => {
    await assertBeforeDeadline(ctx);
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    if (rep.status !== "active") {
      throw new Error("This account is not active yet");
    }
    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new Error("Quantity must be a whole number of at least 1");
    }

    const pricing = regionPricing(hub.region);
    if (!pricing.online) {
      throw new Error(
        "Your hub pays offline — submit a bank/MoMo receipt instead.",
      );
    }

    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "registration",
      "agcRegistrations",
    );
    const registrationId: Id<"agcRegistrations"> = await ctx.db.insert(
      "agcRegistrations",
      {
        hubId: hub._id,
        repId: rep._id,
        region: hub.region,
        contactEmail: rep.email ?? undefined,
        contactPhone: rep.phone ?? undefined,
        quantity: args.quantity,
        unitPrice: pricing.price,
        currency: pricing.currency,
        totalAmount: pricing.price * args.quantity,
        paymentMode: args.paymentMode,
        paymentStatus: "awaiting_payment",
        referenceNumber,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    );

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_registration.online_created",
      entityType: "agcRegistrations",
      entityId: registrationId,
      summary: `Hub ${hub.name} created an online registration ${referenceNumber} (${pricing.price * args.quantity} ${pricing.currency})`,
    });

    return { registrationId, referenceNumber };
  },
});

export const logoutRep = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("agcRepSessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Rep registrations — admin-visible queries live in agcAdminConsole
// ------------------------------------------------------------------
