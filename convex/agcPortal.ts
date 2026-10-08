import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  AGC_DEFAULTS,
  AGC_REGIONS,
  AGC_SETTING_KEYS,
  regionPricing,
} from "./lib/agcConfig";
import { agcOfflinePayment } from "./schemaTypes";
import { amountsMatch } from "./agcAccommodation";
import { isHubPoaEnabled } from "./lib/agcPoaRuntime";
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
  if (!result) throw new ConvexError("Unauthorized");
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

/**
 * Event-wide lockdown toggle (agcSettings.registration_lockdown = "true").
 * Blocks every new registration and accommodation booking immediately,
 * regardless of the deadline.
 */
export async function isRegistrationLocked(ctx: QueryCtx): Promise<boolean> {
  const setting = await ctx.db
    .query("agcSettings")
    .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.lockdown))
    .unique();
  return setting?.value === "true";
}

export async function assertBeforeDeadline(ctx: MutationCtx) {
  if (await isRegistrationLocked(ctx)) {
    throw new ConvexError(
      "Registrations are temporarily locked by the convention administrators.",
    );
  }
  const deadline = await getRegistrationDeadline(ctx);
  if (Date.now() > deadline) {
    throw new ConvexError(
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
      // Payment-on-arrival feature flag for this hub (drives the rep UI).
      paymentOnArrival: await isHubPoaEnabled(ctx, rep.hubId),
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
      throw new ConvexError("A valid email address is required");
    }

    const emailTaken = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (emailTaken && emailTaken._id !== rep._id) {
      throw new ConvexError("This email address is already in use");
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
      locked: map.get(AGC_SETTING_KEYS.lockdown) === "true",
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
        poa: record.poa ?? null,
        // Online registrations can be abandoned mid-checkout — offer a way to
        // resume payment for them instead of forcing a new registration.
        canResumePayment:
          record.paymentStatus === "awaiting_payment" && !record.poa,
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
      throw new ConvexError("This account is not active yet");
    }
    if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
      throw new ConvexError("Quantity must be a whole number of at least 1");
    }

    const pricing = regionPricing(hub.region);
    if (pricing.online) {
      // Legacy Stripe-era guard — online is false for every region now.
      throw new ConvexError(
        "Your hub pays online — no receipt upload needed.",
      );
    }

    // Exact-amount rule: offline payments must equal the system total —
    // nothing less, nothing more. Quantity is the only pricing variable.
    const expectedTotal = pricing.price * args.quantity;
    if (!amountsMatch(args.offline.amountPaid, expectedTotal)) {
      throw new ConvexError(
        `Amount mismatch: you paid ${pricing.currency} ${args.offline.amountPaid} but ${args.quantity} delegate(s) cost exactly ${pricing.currency} ${expectedTotal}. Nothing less, nothing more — pay the exact total and submit again.`,
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
// Rep overview stats (portal Overview tab)
// Delegates are only counted as "paid" once their payment is confirmed;
// pending and cancelled delegates are tracked as separate lines.
// ------------------------------------------------------------------

export const getRepOverview = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    const [registrations, bookings, deadline] = await Promise.all([
      ctx.db
        .query("agcRegistrations")
        .withIndex("by_rep", (q) => q.eq("repId", rep._id))
        .collect(),
      ctx.db
        .query("agcBookings")
        .withIndex("by_rep", (q) => q.eq("repId", rep._id))
        .collect(),
      getRegistrationDeadline(ctx),
    ]);

    const isPaid = (paymentStatus: string) => paymentStatus === "confirmed";
    const isClosed = (bookingStatus: string) =>
      bookingStatus === "cancelled" || bookingStatus === "expired";

    // --- Registrations (quantity-based; no named guests) ---
    let regPaidDelegates = 0;
    let regPendingDelegates = 0;
    let regCancelledDelegates = 0;
    let regPaidAmount = 0;
    let regPendingAmount = 0;
    let receiptsPending = 0;
    let awaitingPayment = 0;
    for (const row of registrations) {
      if (isPaid(row.paymentStatus)) {
        regPaidDelegates += row.quantity;
        regPaidAmount += row.totalAmount;
      } else if (row.paymentStatus === "rejected") {
        // A rejected receipt means the registration did not go through —
        // counted as cancelled delegates.
        regCancelledDelegates += row.quantity;
      } else {
        regPendingDelegates += row.quantity;
        regPendingAmount += row.totalAmount;
      }
      if (
        row.paymentStatus === "pending_verification" ||
        row.paymentStatus === "correction_requested"
      ) {
        receiptsPending += 1;
      }
      if (row.paymentStatus === "awaiting_payment") {
        awaitingPayment += 1;
      }
    }

    // --- Accommodation (named guests, grouped by booking outcome) ---
    let accPaidGuests = 0;
    let accPendingGuests = 0;
    let accCancelledGuests = 0;
    let accPaidAmount = 0;
    let accPendingAmount = 0;
    let confirmedBookings = 0;
    let reservedBookings = 0;
    let cancelledBookings = 0;
    // Per-room-type booked/paid/awaiting units (for the summary tiles).
    const perType = new Map<
      string,
      { booked: number; paid: number; awaiting: number; cancelled: number }
    >();
    const perTypeEntry = (key: string) => {
      let entry = perType.get(key);
      if (!entry) {
        entry = { booked: 0, paid: 0, awaiting: 0, cancelled: 0 };
        perType.set(key, entry);
      }
      return entry;
    };
    for (const booking of bookings) {
      const [bookingGuests, bookingLines] = await Promise.all([
        ctx.db
          .query("agcGuests")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
        ctx.db
          .query("agcBookingLines")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
      ]);
      const activeGuestCount = bookingGuests.filter(
        (guest) => guest.status === "active",
      ).length;

      if (isPaid(booking.paymentStatus) && booking.bookingStatus === "confirmed") {
        accPaidGuests += activeGuestCount;
        accPaidAmount += booking.totalAmount;
        confirmedBookings += 1;
      } else if (isClosed(booking.bookingStatus)) {
        // Cancelled/expired holds — guests no longer count toward the hub.
        accCancelledGuests += activeGuestCount;
        cancelledBookings += 1;
      } else {
        accPendingGuests += activeGuestCount;
        accPendingAmount += booking.totalAmount;
        reservedBookings += 1;
      }
      // Lines carry the reserved units (rooms, or beds on dorm/hostel).
      for (const line of bookingLines) {
        const entry = perTypeEntry(line.accommodationType);
        const closed = isClosed(booking.bookingStatus);
        if (!closed) entry.booked += line.quantity;
        if (closed) {
          entry.cancelled += line.quantity;
        } else if (
          isPaid(booking.paymentStatus) &&
          booking.bookingStatus === "confirmed"
        ) {
          entry.paid += line.quantity;
        } else {
          entry.awaiting += line.quantity;
        }
      }
      if (
        booking.paymentStatus === "pending_verification" ||
        booking.paymentStatus === "correction_requested"
      ) {
        receiptsPending += 1;
      }
      if (
        booking.paymentStatus === "awaiting_payment" &&
        booking.bookingStatus === "reserved"
      ) {
        awaitingPayment += 1;
      }
    }

    return {
      hubName: hub.name,
      hubRegion: hub.region,
      repName: `${rep.firstName ?? ""} ${rep.lastName ?? ""}`.trim(),
      currency: hub.region === "ghana" || hub.region === "west_africa" ? "GHS" : "USD",
      isGhsRegion: hub.region === "ghana" || hub.region === "west_africa",
      deadline,
      registrations: {
        count: registrations.length,
        paidDelegates: regPaidDelegates,
        pendingDelegates: regPendingDelegates,
        cancelledDelegates: regCancelledDelegates,
        paidAmount: regPaidAmount,
        pendingAmount: regPendingAmount,
      },
      accommodation: {
        count: bookings.length,
        confirmedBookings,
        reservedBookings,
        cancelledBookings,
        paidGuests: accPaidGuests,
        pendingGuests: accPendingGuests,
        cancelledGuests: accCancelledGuests,
        paidAmount: accPaidAmount,
        pendingAmount: accPendingAmount,
        // Reserved units per room type, split by payment outcome.
        perType: [...perType.entries()].map(([type, counts]) => ({
          type,
          ...counts,
        })),
      },
      receiptsPending,
      awaitingPayment,
      totalPaidDelegates: regPaidDelegates + accPaidGuests,
      totalPendingDelegates: regPendingDelegates + accPendingGuests,
      totalCancelledDelegates: regCancelledDelegates + accCancelledGuests,
    };
  },
});

// ------------------------------------------------------------------
// Internal data feed for the rep Excel exports (actions live in agcExcel)
// ------------------------------------------------------------------

export const internalRepRegistrationExport = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    const registrations = await ctx.db
      .query("agcRegistrations")
      .withIndex("by_rep", (q) => q.eq("repId", rep._id))
      .collect();
    return {
      hubName: hub.name,
      region: hub.region,
      repName: `${rep.firstName ?? ""} ${rep.lastName ?? ""}`.trim() || rep.username,
      registrations: registrations.map((row) => ({
        referenceNumber: row.referenceNumber ?? "",
        region: row.region,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        totalAmount: row.totalAmount,
        currency: row.currency,
        paymentMode: row.paymentMode,
        paymentStatus: row.paymentStatus,
        offlineRef: row.offline?.referenceNumber ?? "",
        method: row.offline?.method ?? "",
        paymentDate: row.offline?.paymentDate ?? "",
        amountPaid: row.offline?.amountPaid ?? null,
        adminMessage: row.adminMessage ?? null,
        createdAt: row.createdAt,
        paidAt: row.paidAt ?? null,
      })),
    };
  },
});

// ------------------------------------------------------------------
// Rep registrations — admin-visible queries live in agcAdminConsole
// ------------------------------------------------------------------
