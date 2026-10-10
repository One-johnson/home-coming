import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, sessionTokenValidator } from "./users";
import { requireRep, assertBeforeDeadline } from "./agcPortal";
import { isHubPoaEnabled } from "./lib/agcPoaRuntime";
import { regionPricing } from "./lib/agcConfig";
import { createUniqueReferenceNumber } from "./lib/referenceNumbers";
import { writeAuditLog } from "./lib/audit";
import { isSmtpConfigured } from "./lib/smtpConfig";
import { confirmBookingInventory } from "./agcAccommodation";
import { AGC_ACCOMMODATION_LABELS } from "../src/lib/agcPortal";

/**
 * Payment on arrival (POA) — hubs granted this feature by an admin can
 * register delegates and book accommodation without paying up front. An IOU
 * receipt is generated on demand (never stored in the DB) that the rep can
 * print and upload payment evidence against. Amounts are only credited once
 * an admin/finance confirms the payment.
 */

async function queuePoaEmail(
  ctx: MutationCtx,
  args: {
    repId: Id<"agcRepresentatives">;
    subject: string;
    body: string;
    referenceId: string;
    type: string;
  },
) {
  const rep = await ctx.db.get(args.repId);
  if (!rep?.email) return;
  const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
  const emailLogId: Id<"emailLogs"> = await ctx.db.insert("emailLogs", {
    to: rep.email,
    subject: args.subject,
    body: args.body,
    type: args.type,
    referenceId: args.referenceId,
    status,
    createdAt: Date.now(),
  });
  if (status === "pending") {
    await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
      emailLogId,
    });
  }
}

// ------------------------------------------------------------------
// Admin: grant / revoke the POA feature per hub
// ------------------------------------------------------------------

export const listPoaHubsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    const hubs = await ctx.db.query("agcHubs").withIndex("by_name").collect();
    const grants = await ctx.db.query("agcPoaHubs").collect();
    const grantedHubIds = new Set(grants.map((grant) => grant.hubId));
    const reps = (await ctx.db.query("agcRepresentatives").collect()).filter(
      (rep) => rep.deletedAt === undefined,
    );
    const repByHub = new Map(reps.map((rep) => [rep.hubId, rep]));
    return hubs.map((hub) => ({
      _id: hub._id,
      name: hub.name,
      region: hub.region,
      country: hub.country,
      active: hub.active !== false,
      repUsername: repByHub.get(hub._id)?.username ?? null,
      poaEnabled: grantedHubIds.has(hub._id),
    }));
  },
});

export const setHubPoa = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    hubId: v.id("agcHubs"),
    enabled: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin"]);
    const hub = await ctx.db.get(args.hubId);
    if (!hub) throw new ConvexError("Hub not found");

    const existing = await ctx.db
      .query("agcPoaHubs")
      .withIndex("by_hub", (q) => q.eq("hubId", args.hubId))
      .collect();
    if (args.enabled) {
      if (existing.length === 0) {
        await ctx.db.insert("agcPoaHubs", {
          hubId: args.hubId,
          note: args.note,
          assignedBy: actor.email,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } else {
      for (const row of existing) {
        await ctx.db.delete(row._id);
      }
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: args.enabled ? "agc_poa.hub_enabled" : "agc_poa.hub_disabled",
      entityType: "agcHubs",
      entityId: args.hubId,
      summary: `${args.enabled ? "Granted" : "Revoked"} payment-on-arrival for hub ${hub.name}`,
    });
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Admin/finance: confirm a POA payment — credits the amount as paid,
// converts the IOU to a paid receipt, and (for bookings) confirms the
// inventory hold and the booking itself so rooms can be assigned.
// ------------------------------------------------------------------

export const confirmPoaPayment = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    kind: v.union(v.literal("registration"), v.literal("booking")),
    recordId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "finance",
    ]);
    const now = Date.now();

    if (args.kind === "registration") {
      const record = await ctx.db.get(
        args.recordId as Id<"agcRegistrations">,
      );
      if (!record) throw new ConvexError("Registration not found");
      if (!record.poa) {
        throw new ConvexError("This registration is not on payment-on-arrival terms");
      }
      if (record.poa.status === "confirmed") {
        throw new ConvexError("This payment is already confirmed");
      }
      await ctx.db.patch(record._id, {
        paymentStatus: "confirmed",
        paidAt: record.paidAt ?? now,
        confirmedAt: now,
        adminMessage: args.note?.trim() || record.adminMessage,
        poa: {
          ...record.poa,
          status: "confirmed",
          confirmedAt: now,
          confirmedBy: actor.email,
        },
        updatedAt: now,
      });
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "agc_registration.poa_confirmed",
        entityType: "agcRegistrations",
        entityId: record._id,
        summary: `Confirmed POA payment for registration ${record.referenceNumber ?? ""} (${record.totalAmount} ${record.currency}) by ${actor.email}`,
        metadata: { note: args.note },
      });
      await queuePoaEmail(ctx, {
        repId: record.repId,
        subject: `Homecoming 2026 — payment confirmed (${record.referenceNumber ?? ""})`,
        body: [
          "Hello,",
          "",
          `Your payment of ${record.currency} ${record.totalAmount} for registration ${record.referenceNumber ?? ""} has been confirmed.`,
          "Your IOU receipt is now a paid receipt in the portal.",
          "",
          "— Homecoming 2026 Registration Desk",
        ].join("\n"),
        referenceId: record._id,
        type: "agc_poa_confirmed",
      });
      return { success: true as const };
    }

    const booking = await ctx.db.get(args.recordId as Id<"agcBookings">);
    if (!booking) throw new ConvexError("Booking not found");
    if (!booking.poa) {
      throw new ConvexError("This booking is not on payment-on-arrival terms");
    }
    if (booking.poa.status === "confirmed") {
      throw new ConvexError("This payment is already confirmed");
    }
    if (
      booking.bookingStatus === "expired" ||
      booking.bookingStatus === "cancelled"
    ) {
      throw new ConvexError("This booking is no longer active");
    }
    await ctx.db.patch(booking._id, {
      paymentStatus: "confirmed",
      bookingStatus: "confirmed",
      paidAt: booking.paidAt ?? now,
      confirmedAt: now,
      expiresAt: undefined,
      adminMessage: args.note?.trim() || booking.adminMessage,
      poa: {
        ...booking.poa,
        status: "confirmed",
        confirmedAt: now,
        confirmedBy: actor.email,
      },
      updatedAt: now,
    });
    await confirmBookingInventory(ctx, booking._id);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_booking.poa_confirmed",
      entityType: "agcBookings",
      entityId: booking._id,
      summary: `Confirmed POA payment for booking ${booking.referenceNumber ?? ""} (${booking.totalAmount} ${booking.currency}) by ${actor.email}`,
      metadata: { note: args.note },
    });
    await queuePoaEmail(ctx, {
      repId: booking.repId,
      subject: `Homecoming 2026 — payment confirmed (${booking.referenceNumber ?? ""})`,
      body: [
        "Hello,",
        "",
        `Your payment of ${booking.currency} ${booking.totalAmount} for booking ${booking.referenceNumber ?? ""} has been confirmed.`,
        "Your IOU receipt is now a paid receipt in the portal and your beds are locked in.",
        "",
        "— Homecoming 2026 Accommodation Desk",
      ].join("\n"),
      referenceId: booking._id,
      type: "agc_poa_confirmed",
    });
    return { success: true as const };
  },
});

export const submitPoaRegistration = mutation({
  args: {
    sessionToken: v.string(),
    quantity: v.number(),
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
    // Server-side feature gate: only hubs granted POA may use this flow.
    if (!(await isHubPoaEnabled(ctx, hub._id))) {
      throw new ConvexError(
        "Your hub is not enrolled in payment on arrival — please pay by bank transfer or mobile money.",
      );
    }

    const pricing = regionPricing(hub.region);
    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "registration",
      "agcRegistrations",
    );
    const now = Date.now();
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
        paymentMode: "payment_on_arrival",
        paymentStatus: "awaiting_payment",
        poa: { status: "pending" },
        referenceNumber,
        createdAt: now,
        updatedAt: now,
      },
    );

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_registration.poa_created",
      entityType: "agcRegistrations",
      entityId: registrationId,
      summary: `Hub ${hub.name} registered ${args.quantity} delegate(s) on payment-on-arrival terms (${referenceNumber})`,
      metadata: {
        quantity: args.quantity,
        amount: pricing.price * args.quantity,
        currency: pricing.currency,
      },
    });

    await queuePoaEmail(ctx, {
      repId: rep._id,
      subject: `Homecoming 2026 — registration ${referenceNumber} (payment on arrival)`,
      body: [
        `Hello ${rep.firstName ?? rep.username},`,
        "",
        `Your hub is enrolled in payment on arrival, so registration ${referenceNumber}`,        `for ${args.quantity} delegate(s) was created without payment.`,
        `Total due on arrival: ${pricing.currency} ${pricing.price * args.quantity}.`,
        "",
        "Your IOU receipt is available in the portal — print it or keep it for",        "your records. When you pay, upload your payment evidence in the portal",        "and the registration desk will confirm the payment.",
        "",
        "— Homecoming 2026 Registration Desk",
      ].join("\n"),
      referenceId: registrationId,
      type: "agc_registration_poa_created",
    });

    return { registrationId, referenceNumber };
  },
});

// ------------------------------------------------------------------
// Rep: upload payment evidence against a POA registration or booking
// ------------------------------------------------------------------

const evidenceValidator = v.object({
  storageId: v.id("_storage"),
  fileName: v.string(),
  contentType: v.optional(v.string()),
  note: v.optional(v.string()),
});

export const submitPoaEvidence = mutation({
  args: {
    sessionToken: v.string(),
    kind: v.union(v.literal("registration"), v.literal("booking")),
    recordId: v.string(),
    evidence: evidenceValidator,
  },
  handler: async (ctx, args) => {
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    const now = Date.now();

    let record: Doc<"agcRegistrations"> | Doc<"agcBookings"> | null;
    if (args.kind === "registration") {
      record = await ctx.db.get(args.recordId as Id<"agcRegistrations">);
    } else {
      record = await ctx.db.get(args.recordId as Id<"agcBookings">);
    }
    if (!record || record.repId !== rep._id) {
      throw new ConvexError("Record not found");
    }
    if (!record.poa) {
      throw new ConvexError("This record is not on payment-on-arrival terms");
    }
    if (record.poa.status === "confirmed") {
      throw new ConvexError("This payment is already confirmed");
    }
    if (
      args.kind === "booking" &&
      ((record as Doc<"agcBookings">).bookingStatus === "cancelled" ||
        (record as Doc<"agcBookings">).bookingStatus === "expired")
    ) {
      throw new ConvexError("This booking is no longer active");
    }

    const patch = {
      poa: {
        ...record.poa,
        status: "evidence_submitted" as const,
        evidenceStorageId: args.evidence.storageId,
        evidenceFileName: args.evidence.fileName,
        evidenceContentType: args.evidence.contentType ?? undefined,
        note: args.evidence.note?.trim() || undefined,
        submittedAt: now,
      },
      updatedAt: now,
    };
    await ctx.db.patch(record._id, patch);

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: args.kind === "registration" ? "agc_registration.poa_evidence" : "agc_booking.poa_evidence",
      entityType: args.kind === "registration" ? "agcRegistrations" : "agcBookings",
      entityId: record._id,
      summary: `Rep ${rep.username} uploaded POA payment evidence for ${record.referenceNumber ?? "record"}`,      metadata: { fileName: args.evidence.fileName, note: args.evidence.note },
    });

    // Notify platform admins that POA payment evidence awaits confirmation.
    const adminNotify = await ctx.runMutation(
      internal.agcAdminData.notifyAdminsOfPendingReview,
      {
        kind: args.kind,
        referenceNumber: record.referenceNumber ?? undefined,
        hubName: hub.name,
        amount: record.totalAmount,
        currency: record.currency,
        recordId: record._id,
      },
    );
    for (const entry of adminNotify) {
      if (entry.shouldSend) {
        await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
          emailLogId: entry.emailLogId,
        });
      }
    }

    await queuePoaEmail(ctx, {
      repId: rep._id,
      subject: `Homecoming 2026 — payment evidence received (${record.referenceNumber ?? ""})`,
      body: [
        `Hello ${rep.firstName ?? rep.username},`,
        "",
        `We have received your payment evidence for ${record.referenceNumber ?? "your record"}.`,
        "The registration desk will confirm the payment and your receipt will",        "change to a paid receipt.",
        "",
        "— Homecoming 2026 Registration Desk",
      ].join("\n"),
      referenceId: record._id,
      type: "agc_poa_evidence_received",
    });

    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Venue desk: check-in sheet for payment-on-arrival collection.
// One row per unconfirmed POA record — registrations plus accommodation
// bookings with their guest roster — so the desk can search by reference,
// hub, or guest name, tick rows off as cash arrives, and confirm payments
// in one tap. Same authorization as the POA tables (admin + finance).
// ------------------------------------------------------------------

export const listPoaDeskData = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "finance"]);
    const hubs = new Map(
      (await ctx.db.query("agcHubs").collect()).map((hub) => [hub._id, hub.name]),
    );

    type DeskRow = {
      kind: "registration" | "booking";
      recordId: string;
      referenceNumber: string;
      hubId: string;
      hubName: string;
      region: string;
      currency: string;
      totalAmount: number;
      units: number;
      poaStatus: string;
      paymentStatus: string;
      bookingStatus: string | null;
      evidenceFileName: string | null;
      note: string | null;
      guests: Array<{ name: string; type: string; gender: string }>;
      createdAt: number;
    };

    const rows: DeskRow[] = [];

    const guestName = (
      guest: Doc<"agcGuests"> | { firstName: string; lastName: string },
    ) => `${guest.firstName} ${guest.lastName}`.trim();
    const typeLabel = (
      type: string,
    ) =>
      AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ??
      type;

    for (const record of (
      await ctx.db.query("agcRegistrations").withIndex("by_created_at").collect()
    ).filter((row) => !row.deletedAt && row.poa)) {
      if (record.poa!.status === "confirmed") continue;
      const rep = await ctx.db.get(record.repId);
      rows.push({
        kind: "registration",
        recordId: record._id,
        referenceNumber: record.referenceNumber ?? "",
        hubId: record.hubId,
        hubName: hubs.get(record.hubId) ?? "(unknown)",
        region: record.region,
        currency: record.currency,
        totalAmount: record.totalAmount,
        units: record.quantity,
        poaStatus: record.poa!.status,
        paymentStatus: record.paymentStatus,
        bookingStatus: null,
        evidenceFileName: record.poa!.evidenceFileName ?? null,
        note: record.poa!.note ?? null,
        guests: [
          {
            name: rep ? `${rep.username} (rep)` : "—",
            type: `Registration × ${record.quantity}`,
            gender: "—",
          },
        ],
        createdAt: record.createdAt,
      });
    }

    for (const booking of (
      await ctx.db.query("agcBookings").withIndex("by_created_at").collect()
    ).filter((row) => !row.deletedAt && row.poa)) {
      if (booking.poa!.status === "confirmed") continue;
      const guests = (
        await ctx.db
          .query("agcGuests")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect()
      ).filter((guest) => guest.status === "active");
      rows.push({
        kind: "booking",
        recordId: booking._id,
        referenceNumber: booking.referenceNumber ?? "",
        hubId: booking.hubId,
        hubName: hubs.get(booking.hubId) ?? "(unknown)",
        region: booking.region,
        currency: booking.currency,
        totalAmount: booking.totalAmount,
        units: guests.length,
        poaStatus: booking.poa!.status,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        evidenceFileName: booking.poa!.evidenceFileName ?? null,
        note: booking.poa!.note ?? null,
        guests: guests.map((guest) => ({
          name: guestName(guest),
          type: typeLabel(guest.accommodationType),
          gender: guest.gender,
        })),
        createdAt: booking.createdAt,
      });
    }

    // Newest first — the desk usually handles records created last.
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  },
});

// ------------------------------------------------------------------
// Venue desk: end-of-day reconciliation for payment-on-arrival cash.
// Compares the cash actually confirmed at the desk (confirmed POA records
// with no uploaded evidence — money handed over at check-in) against the
// outstanding IOUs still uncollected. Grouped per hub + currency so the
// finance officer can cash-up the drawer against the books.
// ------------------------------------------------------------------

export const getPoaDailyReconciliation = query({
  args: {
    sessionToken: sessionTokenValidator,
    /** Local calendar day (ms since epoch for any instant in that day). */
    dayTs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "finance"]);
    const day = args.dayTs ?? Date.now();
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;

    const hubs = await ctx.db.query("agcHubs").collect();
    const hubById = new Map(hubs.map((hub) => [hub._id, hub.name]));

    type Line = {
      hubId: string;
      hubName: string;
      currency: string;
      collectedCount: number;
      collectedAmount: number;
      collectedDeskCount: number;
      collectedOnlineCount: number;
      outstandingCount: number;
      outstandingAmount: number;
      units: number;
    };
    const lines = new Map<string, Line>();
    const line = (
      hubId: string,
      currency: string,
    ): Line => {
      const key = `${hubId}::${currency}`;
      let entry = lines.get(key);
      if (!entry) {
        entry = {
          hubId,
          hubName: hubById.get(hubId as Id<"agcHubs">) ?? "(unknown)",
          currency,
          collectedCount: 0,
          collectedAmount: 0,
          collectedDeskCount: 0,
          collectedOnlineCount: 0,
          outstandingCount: 0,
          outstandingAmount: 0,
          units: 0,
        };
        lines.set(key, entry);
      }
      return entry;
    };

    const inDay = (ts: number | undefined) =>
      ts !== undefined && ts >= dayStart.getTime() && ts < dayEnd;

    const registrations = (
      await ctx.db.query("agcRegistrations").collect()
    ).filter((row) => !row.deletedAt && row.poa);
    for (const record of registrations) {
      if (record.poa!.status === "confirmed" && inDay(record.poa!.confirmedAt)) {
        const entry = line(record.hubId, record.currency);
        entry.collectedCount += 1;
        entry.collectedAmount += record.totalAmount;
        // Evidence present → paid offline elsewhere (bank/MoMo) and confirmed
        // here; no evidence → cash handed over at the venue desk.
        if (record.poa!.evidenceStorageId) entry.collectedOnlineCount += 1;
        else entry.collectedDeskCount += 1;
        entry.units += record.quantity;
      } else if (record.poa!.status !== "confirmed") {
        const entry = line(record.hubId, record.currency);
        entry.outstandingCount += 1;
        entry.outstandingAmount += record.totalAmount;
      }
    }

    const bookings = (
      await ctx.db.query("agcBookings").collect()
    ).filter((row) => !row.deletedAt && row.poa);
    for (const booking of bookings) {
      if (booking.poa!.status === "confirmed" && inDay(booking.poa!.confirmedAt)) {
        const entry = line(booking.hubId, booking.currency);
        entry.collectedCount += 1;
        entry.collectedAmount += booking.totalAmount;
        if (booking.poa!.evidenceStorageId) entry.collectedOnlineCount += 1;
        else entry.collectedDeskCount += 1;
        const guests = await ctx.db
          .query("agcGuests")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect();
        entry.units += guests.filter((g) => g.status === "active").length;
      } else if (booking.poa!.status !== "confirmed") {
        const entry = line(booking.hubId, booking.currency);
        entry.outstandingCount += 1;
        entry.outstandingAmount += booking.totalAmount;
      }
    }

    const rows = [...lines.values()].sort(
      (a, b) =>
        a.hubName.localeCompare(b.hubName) || a.currency.localeCompare(b.currency),
    );
    const byCurrency: Record<string, { collected: number; outstanding: number }> = {};
    for (const row of rows) {
      const agg = (byCurrency[row.currency] ??= { collected: 0, outstanding: 0 });
      agg.collected += row.collectedAmount;
      agg.outstanding += row.outstandingAmount;
    }
    return { dayStart: dayStart.getTime(), rows, byCurrency };
  },
});

// ------------------------------------------------------------------
// Admin/finance: combined POA status table (registrations + bookings)
// ------------------------------------------------------------------

export const listPoaRecordsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "finance"]);
    const hubs = new Map(
      (await ctx.db.query("agcHubs").collect()).map((hub) => [hub._id, hub.name]),
    );

    const rows: Array<{
      kind: "registration" | "booking";
      _id: string;
      referenceNumber: string;
      hubName: string;
      region: string;
      currency: string;
      totalAmount: number;
      units: number;
      paymentStatus: string;
      bookingStatus: string | null;
      poaStatus: string;
      evidenceUrl: string | null;
      evidenceFileName: string | null;
      createdAt: number;
      submittedAt: number | null;
      confirmedAt: number | null;
    }> = [];

    const registrations = (
      await ctx.db.query("agcRegistrations").withIndex("by_created_at").collect()
    ).filter((row) => !row.deletedAt && row.poa);
    for (const record of registrations) {
      rows.push({
        kind: "registration",
        _id: record._id,
        referenceNumber: record.referenceNumber ?? "",
        hubName: hubs.get(record.hubId) ?? "(unknown)",
        region: record.region,
        currency: record.currency,
        totalAmount: record.totalAmount,
        units: record.quantity,
        paymentStatus: record.paymentStatus,
        bookingStatus: null,
        poaStatus: record.poa!.status,
        evidenceUrl: record.poa!.evidenceStorageId
          ? ((await ctx.storage.getUrl(record.poa!.evidenceStorageId)) ?? null)
          : null,
        evidenceFileName: record.poa!.evidenceFileName ?? null,
        createdAt: record.createdAt,
        submittedAt: record.poa!.submittedAt ?? null,
        confirmedAt: record.poa!.confirmedAt ?? null,
      });
    }

    const bookings = (
      await ctx.db.query("agcBookings").withIndex("by_created_at").collect()
    ).filter((row) => !row.deletedAt && row.poa);
    for (const booking of bookings) {
      const guests = await ctx.db
        .query("agcGuests")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect();
      rows.push({
        kind: "booking",
        _id: booking._id,
        referenceNumber: booking.referenceNumber ?? "",
        hubName: hubs.get(booking.hubId) ?? "(unknown)",
        region: booking.region,
        currency: booking.currency,
        totalAmount: booking.totalAmount,
        units: guests.filter((guest) => guest.status === "active").length,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        poaStatus: booking.poa!.status,
        evidenceUrl: booking.poa!.evidenceStorageId
          ? ((await ctx.storage.getUrl(booking.poa!.evidenceStorageId)) ?? null)
          : null,
        evidenceFileName: booking.poa!.evidenceFileName ?? null,
        createdAt: booking.createdAt,
        submittedAt: booking.poa!.submittedAt ?? null,
        confirmedAt: booking.poa!.confirmedAt ?? null,
      });
    }

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ------------------------------------------------------------------
// Rep: IOU / paid receipt — generated on demand, never stored in the DB.
// The same document renders as an IOU while unpaid and as a paid receipt
// once the POA payment is confirmed.
// ------------------------------------------------------------------

export const getPoaIou = query({
  args: {
    sessionToken: v.string(),
    kind: v.union(v.literal("registration"), v.literal("booking")),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const { rep, hub } = await requireRep(ctx, args.sessionToken);

    if (args.kind === "registration") {
      const record = await ctx.db.get(args.recordId as Id<"agcRegistrations">);
      if (!record || record.repId !== rep._id) {
        throw new ConvexError("Record not found");
      }
      return {
        kind: "registration" as const,
        referenceNumber: record.referenceNumber ?? "",
        hubName: hub.name,
        region: record.region,
        repName: rep.username,
        currency: record.currency,
        issuedAt: record.createdAt,
        poaStatus: record.poa?.status ?? "pending",
        confirmedAt: record.poa?.confirmedAt ?? null,
        totalAmount: record.totalAmount,
        lines: [
          {
            description: `Registration — ${record.quantity} delegate(s)`,
            quantity: record.quantity,
            unitPrice: record.unitPrice,
            amount: record.totalAmount,
          },
        ],
      };
    }

    const booking = await ctx.db.get(args.recordId as Id<"agcBookings">);
    if (!booking || booking.repId !== rep._id) {
      throw new ConvexError("Record not found");
    }
    const lines = await ctx.db
      .query("agcBookingLines")
      .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
      .collect();
    return {
      kind: "booking" as const,
      referenceNumber: booking.referenceNumber ?? "",
      hubName: hub.name,
      region: booking.region,
      repName: rep.username,
      currency: booking.currency,
      issuedAt: booking.createdAt,
      poaStatus: booking.poa?.status ?? "pending",
      confirmedAt: booking.poa?.confirmedAt ?? null,
      totalAmount: booking.totalAmount,
      lines: lines.map((line) => ({
        description: `${AGC_ACCOMMODATION_LABELS[line.accommodationType] ?? line.accommodationType}${line.isBishopRate ? " (Bishop rate)" : ""}`,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.unitPrice * line.quantity,
      })),
    };
  },
});
