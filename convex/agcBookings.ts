import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  AGC_ACCOMMODATION_TYPES,
  AGC_BISHOP_RATE,
  AGC_SETTING_KEYS,
} from "./lib/agcConfig";
import { agcOfflinePayment } from "./schemaTypes";
import { isSmtpConfigured } from "./lib/smtpConfig";
import { writeAuditLog } from "./lib/audit";
import { createUniqueReferenceNumber } from "./lib/referenceNumbers";
import {
  assertBeforeDeadline,
  availabilityForRegion,
  computeHoldExpiry,
  createBookingWithGuests,
  releaseBookingInventory,
  applySubstitution,
  getHoldHours,
  getDeadlineMs,
  type BookingGuestInput,
} from "./agcAccommodation";
import { requireRep } from "./agcPortal";

const guestValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  gender: v.union(v.literal("male"), v.literal("female")),
  title: v.string(),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  accommodationType: v.union(
    v.literal("dormitory"),
    v.literal("hostel"),
    v.literal("wise_serpents"),
    v.literal("good_general"),
    v.literal("ebpv"),
  ),
  isBishopRate: v.boolean(),
});

const paymentModeValidator = v.union(
  v.literal("offline"),
  v.literal("stripe"),
  v.literal("paypal"),
);

// ------------------------------------------------------------------
// Availability + config for the accommodation tab
// ------------------------------------------------------------------

export const getAccommodationOverview = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    const [availability, holdHours, deadline] = await Promise.all([
      availabilityForRegion(ctx, hub.region),
      getHoldHours(ctx),
      getDeadlineMs(ctx),
    ]);
    return {
      hubName: hub.name,
      region: hub.region,
      currency: hub.region === "ghana" || hub.region === "west_africa" ? "GHS" : "USD",
      isGhsRegion: hub.region === "ghana" || hub.region === "west_africa",
      bishopRate: {
        ghs: AGC_BISHOP_RATE.ghs,
        usd: AGC_BISHOP_RATE.usd,
      },
      accommodationTypes: Object.entries(AGC_ACCOMMODATION_TYPES).map(
        ([key, value]) => ({ type: key, ...value }),
      ),
      availability,
      holdHours,
      deadline,
      accommodationBankDetails: (
        await ctx.db
          .query("agcSettings")
          .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.accommodationBank))
          .unique()
      )?.value,
    };
  },
});

// ------------------------------------------------------------------
// Booking creation (SRS §22, §38) — atomic hold + pricing
// ------------------------------------------------------------------

/** Called by the Excel upload action — guests were parsed in Node runtime. */
export const createBookingFromExcelInternal = internalMutation({
  args: {
    sessionToken: v.string(),
    guests: v.array(guestValidator),
    rowErrors: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await assertBeforeDeadline(ctx);
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    if (rep.status !== "active") {
      throw new Error("This account is not active yet");
    }
    if (args.guests.length === 0) {
      throw new Error("The uploaded file has no valid guest rows");
    }

    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "stay",
      "agcBookings",
    );
    const result = await createBookingWithGuests(ctx, {
      hub,
      rep,
      guests: args.guests as BookingGuestInput[],
      paymentMode:
        hub.region === "ghana" || hub.region === "west_africa"
          ? "offline"
          : "stripe",
      referenceNumber,
    });

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_booking.created_from_excel",
      entityType: "agcBookings",
      entityId: result.bookingId,
      summary: `Hub ${hub.name} uploaded ${args.guests.length} guest(s) via Excel (${referenceNumber})`,
      metadata: { rowErrors: args.rowErrors },
    });

    return {
      bookingId: result.bookingId,
      referenceNumber: result.referenceNumber,
      totalAmount: result.totalAmount,
      currency: result.currency,
      guestCount: args.guests.length,
      errors: args.rowErrors,
    };
  },
});

export const createBooking = mutation({
  args: {
    sessionToken: v.string(),
    guests: v.array(guestValidator),
    paymentMode: paymentModeValidator,
  },
  handler: async (ctx, args) => {
    await assertBeforeDeadline(ctx);
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    if (rep.status !== "active") {
      throw new Error("This account is not active yet");
    }
    if (args.guests.length === 0) {
      throw new Error("Add at least one guest");
    }

    const referenceNumber = await createUniqueReferenceNumber(
      ctx,
      "stay",
      "agcBookings",
    );

    const result = await createBookingWithGuests(ctx, {
      hub,
      rep,
      guests: args.guests as BookingGuestInput[],
      paymentMode: args.paymentMode,
      referenceNumber,
    });

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_booking.created",
      entityType: "agcBookings",
      entityId: result.bookingId,
      summary: `Hub ${hub.name} reserved accommodation ${referenceNumber} (${result.totalAmount} ${result.currency})`,
      metadata: {
        guests: args.guests.length,
        paymentMode: args.paymentMode,
        expiresAt: result.expiresAt,
      },
    });

    // §50 acknowledgment: hold window + payment instructions.
    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    if (rep.email) {
      const emailLogId: Id<"emailLogs"> = await ctx.db.insert("emailLogs", {
        to: rep.email,
        subject: `Homecoming 2026 — accommodation reserved (${referenceNumber})`,
        body: [
          `Hello ${rep.firstName ?? rep.username},`,
          "",
          `Your accommodation reservation ${referenceNumber} for ${args.guests.length} guest(s) is held until`,
          new Date(result.expiresAt).toUTCString(),
          `Total: ${result.totalAmount} ${result.currency}`,
          args.paymentMode === "offline"
            ? "Pay by bank transfer or mobile money, then upload your receipt in the portal."
            : "Complete payment online to confirm your reservation.",
          "",
          "— Homecoming 2026 Accommodation Desk",
        ].join("\n"),
        type: "agc_booking_reserved",
        referenceId: result.bookingId,
        status,
        createdAt: Date.now(),
      });
      if (status === "pending") {
        await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
          emailLogId,
        });
      }
    }

    return {
      bookingId: result.bookingId,
      referenceNumber: result.referenceNumber,
      expiresAt: result.expiresAt,
      totalAmount: result.totalAmount,
      currency: result.currency,
      lines: result.lines,
    };
  },
});

/** Rep cancels an unpaid reservation — units return to the pool (§31, §47). */
export const cancelBooking = mutation({
  args: {
    sessionToken: v.string(),
    bookingId: v.id("agcBookings"),
  },
  handler: async (ctx, args) => {
    const { rep } = await requireRep(ctx, args.sessionToken);
    const booking: Doc<"agcBookings"> | null = await ctx.db.get(args.bookingId);
    if (!booking || booking.repId !== rep._id) {
      throw new Error("Booking not found");
    }
    if (booking.bookingStatus !== "reserved") {
      throw new Error("Only unpaid reservations can be cancelled");
    }

    await releaseBookingInventory(ctx, booking, "cancel");
    await ctx.db.patch(args.bookingId, {
      bookingStatus: "cancelled",
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_booking.cancelled_by_rep",
      entityType: "agcBookings",
      entityId: args.bookingId,
      summary: `Rep ${rep.username} cancelled reservation ${booking.referenceNumber ?? ""}`,
    });
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Offline payment for bookings (SRS §40) — receipt upload → review
// ------------------------------------------------------------------

export const submitOfflineBookingPayment = mutation({
  args: {
    sessionToken: v.string(),
    bookingId: v.id("agcBookings"),
    offline: agcOfflinePayment,
  },
  handler: async (ctx, args) => {
    const { rep, hub } = await requireRep(ctx, args.sessionToken);
    const booking: Doc<"agcBookings"> | null = await ctx.db.get(args.bookingId);
    if (!booking || booking.repId !== rep._id) {
      throw new Error("Booking not found");
    }
    if (booking.paymentMode !== "offline") {
      throw new Error("This booking is paid online — complete checkout instead");
    }
    if (
      booking.bookingStatus !== "reserved" ||
      (booking.paymentStatus !== "awaiting_payment" &&
        booking.paymentStatus !== "correction_requested")
    ) {
      throw new Error("This booking can no longer receive a payment submission");
    }
    if (booking.expiresAt && booking.expiresAt < Date.now()) {
      throw new Error(
        "The hold window for this reservation has expired. Create a new booking.",
      );
    }

    await ctx.db.patch(args.bookingId, {
      paymentStatus: "pending_verification",
      offline: {
        ...args.offline,
        receiptFileName: args.offline.receiptFileName ?? undefined,
        receiptContentType: args.offline.receiptContentType ?? undefined,
      },
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_booking.offline_payment_submitted",
      entityType: "agcBookings",
      entityId: args.bookingId,
      summary: `Rep ${rep.username} submitted a receipt for ${booking.referenceNumber ?? "booking"}`,
      metadata: {
        amountPaid: args.offline.amountPaid,
        currency: booking.currency,
        method: args.offline.method,
      },
    });

    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    if (rep.email) {
      const emailLogId: Id<"emailLogs"> = await ctx.db.insert("emailLogs", {
        to: rep.email,
        subject: `Homecoming 2026 — receipt received (${booking.referenceNumber ?? ""})`,
        body: [
          `Hello ${rep.firstName ?? rep.username},`,
          "",
          `We have received your accommodation payment receipt for ${booking.referenceNumber ?? "your booking"}.`,
          "Our finance team will review it and confirm your reservation.",
          "",
          "— Homecoming 2026 Accommodation Desk",
        ].join("\n"),
        type: "agc_booking_receipt_received",
        referenceId: args.bookingId,
        status,
        createdAt: Date.now(),
      });
      if (status === "pending") {
        await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
          emailLogId,
        });
      }
    }

    void hub;
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Rep booking list (SRS §46)
// ------------------------------------------------------------------

export const listRepBookings = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { rep } = await requireRep(ctx, args.sessionToken);
    const bookings = await ctx.db
      .query("agcBookings")
      .withIndex("by_rep", (q) => q.eq("repId", rep._id))
      .collect();

    const result = [];
    for (const booking of bookings) {
      const [guests, lines] = await Promise.all([
        ctx.db
          .query("agcGuests")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
        ctx.db
          .query("agcBookingLines")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
      ]);
      result.push({
        _id: booking._id,
        referenceNumber: booking.referenceNumber ?? "",
        currency: booking.currency,
        totalAmount: booking.totalAmount,
        paymentMode: booking.paymentMode,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        expiresAt: booking.expiresAt ?? null,
        adminMessage: booking.adminMessage ?? null,
        offline: booking.offline ?? null,
        createdAt: booking.createdAt,
        confirmedAt: booking.confirmedAt ?? null,
        guests: guests.map((guest) => ({
          _id: guest._id,
          firstName: guest.firstName,
          lastName: guest.lastName,
          gender: guest.gender,
          title: guest.title,
          accommodationType: guest.accommodationType,
          isBishopRate: guest.isBishopRate,
          status: guest.status,
        })),
        lines: lines.map((line) => ({
          accommodationType: line.accommodationType,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          isBishopRate: line.isBishopRate,
        })),
      });
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ------------------------------------------------------------------
// Substitutions (SRS §42–44) — same gender + same type
// ------------------------------------------------------------------

export const substituteGuest = mutation({
  args: {
    sessionToken: v.string(),
    guestId: v.id("agcGuests"),
    firstName: v.string(),
    lastName: v.string(),
    gender: v.union(v.literal("male"), v.literal("female")),
    title: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { rep } = await requireRep(ctx, args.sessionToken);
    const guest: Doc<"agcGuests"> | null = await ctx.db.get(args.guestId);
    if (!guest) throw new Error("Guest not found");
    const booking = await ctx.db.get(guest.bookingId);
    if (!booking || booking.repId !== rep._id) {
      throw new Error("Guest not found in your bookings");
    }

    const result = await applySubstitution(ctx, {
      guest,
      next: {
        firstName: args.firstName,
        lastName: args.lastName,
        gender: args.gender,
        title: args.title,
        phone: args.phone,
        email: args.email,
      },
      allowOverride: false,
      actorRepId: rep._id,
      reason: args.reason,
    });
    if (!result.ok) throw new Error(result.reason);

    await writeAuditLog(ctx, {
      actorEmail: rep.email ?? rep.username,
      action: "agc_guest.substituted",
      entityType: "agcGuests",
      entityId: guest._id,
      summary: `Rep ${rep.username} substituted ${guest.firstName} ${guest.lastName} → ${args.firstName} ${args.lastName}`,
    });
    return { success: true as const };
  },
});
