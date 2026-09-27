import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getUserBySessionToken,
  requireAdmin,
  requireRole,
  sessionTokenValidator,
} from "./users";
import { writeAuditLog } from "./lib/audit";
import {
  AGC_DEFAULTS,
  AGC_DEFAULT_BANK_DETAILS,
  AGC_DEFAULT_TITLES,
  AGC_INVENTORY_SEED,
  AGC_SETTING_KEYS,
} from "./lib/agcConfig";
import { agcRegion } from "./schemaTypes";
import { isSmtpConfigured } from "./lib/smtpConfig";

// ------------------------------------------------------------------
// Data access for AGC admin features. Queries and mutations live here;
// node-runtime actions (agcAdmin.ts) call these via ctx.runQuery /
// ctx.runMutation. Convex forbids queries/mutations in "use node" files.
// ------------------------------------------------------------------

export async function requireAdminViaAction(ctx: ActionCtx, sessionToken: string) {
  const actor = await ctx.runQuery(internal.users.getSessionUser, {
    sessionToken,
  });
  if (!actor || actor.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return actor;
}

// ------------------------------------------------------------------
// Settings (SRS §55) — deadline, hold window, bank details, titles
// ------------------------------------------------------------------

export const getAgcSettings = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agcSettings").collect();
    const map = new Map(rows.map((row) => [row.key, row.value]));
    return {
      deadline: map.get(AGC_SETTING_KEYS.deadline) ?? AGC_DEFAULTS.deadline,
      holdHours: Number(
        map.get(AGC_SETTING_KEYS.holdHours) ?? AGC_DEFAULTS.holdHours,
      ),
      registrationBankDetails:
        map.get(AGC_SETTING_KEYS.registrationBank) ??
        AGC_DEFAULT_BANK_DETAILS.registration,
      accommodationBankDetails:
        map.get(AGC_SETTING_KEYS.accommodationBank) ??
        AGC_DEFAULT_BANK_DETAILS.accommodation,
      titles: (() => {
        const raw = map.get(AGC_SETTING_KEYS.titles);
        if (!raw) return [...AGC_DEFAULT_TITLES];
        try {
          const parsed: unknown = JSON.parse(raw);
          return Array.isArray(parsed)
            ? parsed.map(String)
            : [...AGC_DEFAULT_TITLES];
        } catch {
          return [...AGC_DEFAULT_TITLES];
        }
      })(),
    };
  },
});

export const setAgcSetting = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    key: v.union(
      v.literal("deadline"),
      v.literal("hold_hours"),
      v.literal("registration_bank_details"),
      v.literal("accommodation_bank_details"),
      v.literal("guest_titles"),
    ),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("agcSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("agcSettings", {
        key: args.key,
        value: args.value,
        updatedAt: Date.now(),
      });
    }
    await writeAuditLog(ctx, {
      action: "agc_setting.updated",
      entityType: "agcSettings",
      entityId: args.key,
      summary: `Updated AGC setting ${args.key}`,
      metadata: { value: args.value },
    });
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Seeds — idempotent defaults for settings + inventory pools
// ------------------------------------------------------------------

export const seedAgcDefaultsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settingsDefaults: Array<[string, string]> = [
      [AGC_SETTING_KEYS.deadline, AGC_DEFAULTS.deadline],
      [AGC_SETTING_KEYS.holdHours, String(AGC_DEFAULTS.holdHours)],
      [
        AGC_SETTING_KEYS.registrationBank,
        AGC_DEFAULT_BANK_DETAILS.registration,
      ],
      [
        AGC_SETTING_KEYS.accommodationBank,
        AGC_DEFAULT_BANK_DETAILS.accommodation,
      ],
      [AGC_SETTING_KEYS.titles, JSON.stringify(AGC_DEFAULT_TITLES)],
    ];
    for (const [key, value] of settingsDefaults) {
      const existing = await ctx.db
        .query("agcSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (!existing) {
        await ctx.db.insert("agcSettings", { key, value, updatedAt: Date.now() });
      }
    }

    for (const seed of AGC_INVENTORY_SEED) {
      const existing = await ctx.db
        .query("agcInventoryPools")
        .withIndex("by_type_scope", (q) =>
          q
            .eq("accommodationType", seed.accommodationType)
            .eq("scope", seed.scope),
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("agcInventoryPools", {
          accommodationType: seed.accommodationType,
          scope: seed.scope,
          total: seed.total,
          reserved: 0,
          confirmed: 0,
        });
      }
    }
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Hubs (SRS §4–5)
// ------------------------------------------------------------------

export const listHubs = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    return await ctx.db.query("agcHubs").withIndex("by_name").collect();
  },
});

export const listActiveHubs = query({
  args: {},
  handler: async (ctx) => {
    const hubs = await ctx.db.query("agcHubs").collect();
    return hubs
      .filter((hub) => hub.active !== false)
      .map((hub) => ({
        _id: hub._id,
        name: hub.name,
        region: hub.region,
        country: hub.country,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createHub = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    name: v.string(),
    region: agcRegion,
    country: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const name = args.name.trim();
    if (!name) throw new Error("Hub name is required");

    const existing = await ctx.db
      .query("agcHubs")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) throw new Error("A hub with this name already exists");

    const hubId: Id<"agcHubs"> = await ctx.db.insert("agcHubs", {
      name,
      region: args.region,
      country: args.country.trim(),
      notes: args.notes?.trim() || undefined,
      active: true,
      createdAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_hub.created",
      entityType: "agcHubs",
      entityId: hubId,
      summary: `Created hub ${name} (${args.region})`,
    });
    return { _id: hubId };
  },
});

export const updateHub = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    hubId: v.id("agcHubs"),
    region: v.optional(agcRegion),
    country: v.optional(v.string()),
    notes: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const hub: Doc<"agcHubs"> | null = await ctx.db.get(args.hubId);
    if (!hub) throw new Error("Hub not found");

    const patch: Partial<Doc<"agcHubs">> = {};
    if (args.region !== undefined) patch.region = args.region;
    if (args.country !== undefined) patch.country = args.country.trim();
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(args.hubId, patch);
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_hub.updated",
      entityType: "agcHubs",
      entityId: args.hubId,
      summary: `Updated hub ${hub.name}`,
      metadata: patch as Record<string, unknown>,
    });
    return { success: true as const };
  },
});

export const requireAdminSession = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");
    return user;
  },
});

export const listBookingExportData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const bookings = await ctx.db.query("agcBookings").collect();
    bookings.sort((a, b) => a.createdAt - b.createdAt);
    const hubs = new Map(
      (await ctx.db.query("agcHubs").collect()).map((hub) => [hub._id, hub.name]),
    );

    const out = [];
    for (const booking of bookings) {
      const guests = await ctx.db
        .query("agcGuests")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .collect();
      out.push({
        booking: {
          _id: booking._id,
          referenceNumber: booking.referenceNumber,
          region: booking.region,
          bookingStatus: booking.bookingStatus,
          paymentStatus: booking.paymentStatus,
          paymentMode: booking.paymentMode,
          totalAmount: booking.totalAmount,
          currency: booking.currency,
          expiresAt: booking.expiresAt,
          createdAt: booking.createdAt,
          hubName: hubs.get(booking.hubId) ?? "(unknown)",
        },
        guests: guests.map((guest) => ({
          title: guest.title,
          firstName: guest.firstName,
          lastName: guest.lastName,
          gender: guest.gender,
          accommodationType: guest.accommodationType,
          pool: guest.pool,
          isBishopRate: guest.isBishopRate,
          status: guest.status,
          country: guest.country,
        })),
      });
    }
    return out;
  },
});

export const listRegistrationExportData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const registrations = await ctx.db.query("agcRegistrations").collect();
    registrations.sort((a, b) => a.createdAt - b.createdAt);
    return registrations.map((record) => ({
      referenceNumber: record.referenceNumber,
      region: record.region,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      totalAmount: record.totalAmount,
      currency: record.currency,
      paymentMode: record.paymentMode,
      paymentStatus: record.paymentStatus,
      offlineRef: record.offline?.referenceNumber ?? "",
      method: record.offline?.method ?? "",
      paymentDate: record.offline?.paymentDate ?? "",
      createdAt: record.createdAt,
    }));
  },
});

export const getHubByName = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agcHubs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
  },
});

export const getHubById = internalQuery({
  args: { hubId: v.id("agcHubs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.hubId);
  },
});

export const patchHub = internalMutation({
  args: {
    hubId: v.id("agcHubs"),
    region: v.optional(agcRegion),
    country: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const patch: Partial<Doc<"agcHubs">> = {};
    if (args.region !== undefined) patch.region = args.region;
    if (args.country !== undefined) patch.country = args.country;
    if (args.active !== undefined) patch.active = args.active;
    await ctx.db.patch(args.hubId, patch);
  },
});

export const insertHub = internalMutation({
  args: {
    name: v.string(),
    region: agcRegion,
    country: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agcHubs", {
      name: args.name,
      region: args.region,
      country: args.country,
      active: true,
      createdAt: Date.now(),
    });
  },
});

// ------------------------------------------------------------------
// Representative account management (SRS §5–6, §58)
// ------------------------------------------------------------------

export const listReps = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const reps = await ctx.db.query("agcRepresentatives").collect();
    const hubs = await ctx.db.query("agcHubs").collect();
    const hubById = new Map(hubs.map((hub) => [hub._id, hub]));
    return reps
      .map((rep) => ({
        _id: rep._id,
        username: rep.username,
        hubId: rep.hubId,
        hubName: hubById.get(rep.hubId)?.name ?? "(unknown hub)",
        email: rep.email ?? null,
        profileComplete: rep.profileComplete,
        status: rep.status,
        createdAt: rep.createdAt,
        updatedAt: rep.updatedAt,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  },
});

export const getRepByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

export const getRepById = internalQuery({
  args: { repId: v.id("agcRepresentatives") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.repId);
  },
});

export const listAllHubsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("agcHubs").withIndex("by_name").collect();
  },
});

export const listAllRepsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username")
      .collect();
  },
});

export const insertRep = internalMutation({
  args: {
    hubId: v.id("agcHubs"),
    username: v.string(),
    passwordHash: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agcRepresentatives", {
      hubId: args.hubId,
      username: args.username,
      email: args.email,
      passwordHash: args.passwordHash,
      profileComplete: false,
      mustChangePassword: true,
      status: "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const resetRepCredentials = internalMutation({
  args: {
    repId: v.id("agcRepresentatives"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Kill sessions and force first-login setup again.
    const sessions = await ctx.db
      .query("agcRepSessions")
      .withIndex("by_rep", (q) => q.eq("repId", args.repId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    await ctx.db.patch(args.repId, {
      passwordHash: args.passwordHash,
      mustChangePassword: true,
      profileComplete: false,
      status: "pending_setup",
      updatedAt: Date.now(),
    });
  },
});

export const setRepStatus = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    repId: v.id("agcRepresentatives"),
    status: v.union(
      v.literal("pending_setup"),
      v.literal("active"),
      v.literal("disabled"),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.db.get(args.repId);
    if (!rep) throw new Error("Representative not found");

    await ctx.db.patch(args.repId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    if (args.status === "disabled") {
      const sessions = await ctx.db
        .query("agcRepSessions")
        .withIndex("by_rep", (q) => q.eq("repId", args.repId))
        .collect();
      for (const session of sessions) {
        await ctx.db.delete(session._id);
      }
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: `agc_rep.${args.status === "disabled" ? "disabled" : "enabled"}`,
      entityType: "agcRepresentatives",
      entityId: args.repId,
      summary: `Set representative ${rep.username} to ${args.status}`,
    });
    return { success: true as const };
  },
});

export const insertAuditEntry = internalMutation({
  args: {
    actorEmail: v.optional(v.string()),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await writeAuditLog(ctx, {
      actorEmail: args.actorEmail,
      action: "agc_admin.action",
      entityType: "agcAdmin",
      summary: args.summary,
    });
  },
});

export async function auditFromAction(
  ctx: MutationCtx,
  actorEmail: string | undefined,
  summary: string,
) {
  await writeAuditLog(ctx, {
    actorEmail,
    action: "agc_admin.action",
    entityType: "agcAdmin",
    summary,
  });
}

// ------------------------------------------------------------------
// Admin review queues (SRS §51–54) + booking management + reallocation
// ------------------------------------------------------------------

export const listAgcRegistrationsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    // §58: finance reviews offline payments alongside super admin.
    await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
      "finance",
    ]);
    const registrations = await ctx.db
      .query("agcRegistrations")
      .withIndex("by_created_at")
      .collect();
    const hubs = new Map(
      (await ctx.db.query("agcHubs").collect()).map((hub) => [hub._id, hub.name]),
    );
    const out = [];
    for (const record of registrations) {
      const receiptUrl = record.offline?.receiptStorageId
        ? ((await ctx.storage.getUrl(record.offline.receiptStorageId)) ?? null)
        : null;
      out.push({
        _id: record._id,
        referenceNumber: record.referenceNumber ?? "",
        hubName: hubs.get(record.hubId) ?? "(unknown)",
        region: record.region,
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
    return out.reverse();
  },
});

export const listAgcBookingsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
      "finance",
    ]);
    const bookings = await ctx.db
      .query("agcBookings")
      .withIndex("by_created_at")
      .collect();
    const hubs = new Map(
      (await ctx.db.query("agcHubs").collect()).map((hub) => [hub._id, hub.name]),
    );
    const out = [];
    for (const booking of bookings) {
      const [guests, receiptUrl] = await Promise.all([
        ctx.db
          .query("agcGuests")
          .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
          .collect(),
        booking.offline?.receiptStorageId
          ? ctx.storage.getUrl(booking.offline.receiptStorageId)
          : Promise.resolve(null),
      ]);
      out.push({
        _id: booking._id,
        referenceNumber: booking.referenceNumber ?? "",
        hubName: hubs.get(booking.hubId) ?? "(unknown)",
        region: booking.region,
        currency: booking.currency,
        totalAmount: booking.totalAmount,
        paymentMode: booking.paymentMode,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        adminMessage: booking.adminMessage ?? null,
        offline: booking.offline ?? null,
        receiptUrl: receiptUrl ?? null,
        expiresAt: booking.expiresAt ?? null,
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
      });
    }
    return out.reverse();
  },
});

const reviewDecision = v.union(
  v.literal("approve"),
  v.literal("reject"),
  v.literal("request_correction"),
);

/** §50: notify the rep of a review outcome via the email log queue. */
async function queueReviewEmail(
  ctx: MutationCtx,
  args: {
    repId: Id<"agcRepresentatives">;
    subject: string;
    body: string;
    referenceId: Id<"agcRegistrations"> | Id<"agcBookings">;
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

function reviewEmailBody(args: {
  decision: "approve" | "reject" | "request_correction";
  reference: string;
  what: string;
  message?: string;
}) {
  const lines = [`Hello,`, ""];
  if (args.decision === "approve") {
    lines.push(
      `Your ${args.what} ${args.reference} has been approved and confirmed. Thank you.`,
    );
  } else if (args.decision === "reject") {
    lines.push(
      `Your ${args.what} ${args.reference} was rejected after review.`,
    );
  } else {
    lines.push(
      `We need a correction on your ${args.what} ${args.reference} before it can be approved.`,
    );
  }
  if (args.message) {
    lines.push("", `Message from the review team: ${args.message}`);
  }
  lines.push("", "— Homecoming 2026 Registration Desk");
  return lines.join("\n");
}

export const reviewAgcRegistration = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    registrationId: v.id("agcRegistrations"),
    decision: reviewDecision,
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "finance",
    ]);
    const record = await ctx.db.get(args.registrationId);
    if (!record) throw new Error("Registration not found");

    if (args.decision === "approve") {
      await ctx.db.patch(args.registrationId, {
        paymentStatus: "confirmed",
        adminMessage: args.message || undefined,
        paidAt: record.paidAt ?? Date.now(),
        confirmedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else if (args.decision === "reject") {
      await ctx.db.patch(args.registrationId, {
        paymentStatus: "rejected",
        adminMessage: args.message || undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.registrationId, {
        paymentStatus: "correction_requested",
        adminMessage: args.message || undefined,
        updatedAt: Date.now(),
      });
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: `agc_registration.${args.decision}`,
      entityType: "agcRegistrations",
      entityId: args.registrationId,
      summary: `${args.decision.replace(/_/g, " ")} registration ${record.referenceNumber ?? ""} by ${actor.email}`,
      metadata: { message: args.message },
    });

    await queueReviewEmail(ctx, {
      repId: record.repId,
      subject: `Homecoming 2026 — registration ${record.referenceNumber ?? ""} ${args.decision.replace(/_/g, " ")}d`,
      body: reviewEmailBody({
        decision: args.decision,
        reference: record.referenceNumber ?? "",
        what: "registration",
        message: args.message,
      }),
      referenceId: args.registrationId,
      type: "agc_registration_review",
    });
    return { success: true as const };
  },
});

export const reviewAgcBooking = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    bookingId: v.id("agcBookings"),
    decision: reviewDecision,
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
      "finance",
    ]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");

    if (args.decision === "approve") {
      if (booking.bookingStatus === "expired" || booking.bookingStatus === "cancelled") {
        throw new Error("This booking is no longer active");
      }
      await ctx.db.patch(args.bookingId, {
        paymentStatus: "confirmed",
        bookingStatus: "confirmed",
        adminMessage: args.message || undefined,
        paidAt: booking.paidAt ?? Date.now(),
        confirmedAt: Date.now(),
        expiresAt: undefined,
        updatedAt: Date.now(),
      });
      const { confirmBookingInventory } = await import("./agcAccommodation");
      await confirmBookingInventory(ctx, args.bookingId);
    } else if (args.decision === "reject") {
      if (booking.bookingStatus === "reserved") {
        const { releaseBookingInventory } = await import("./agcAccommodation");
        await releaseBookingInventory(ctx, booking, "cancel");
      }
      await ctx.db.patch(args.bookingId, {
        paymentStatus: "rejected",
        bookingStatus: "cancelled",
        adminMessage: args.message || undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.bookingId, {
        paymentStatus: "correction_requested",
        adminMessage: args.message || undefined,
        updatedAt: Date.now(),
      });
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: `agc_booking.${args.decision}`,
      entityType: "agcBookings",
      entityId: args.bookingId,
      summary: `${args.decision.replace(/_/g, " ")} booking ${booking.referenceNumber ?? ""} by ${actor.email}`,
      metadata: { message: args.message },
    });

    await queueReviewEmail(ctx, {
      repId: booking.repId,
      subject: `Homecoming 2026 — accommodation ${booking.referenceNumber ?? ""} ${args.decision.replace(/_/g, " ")}d`,
      body: reviewEmailBody({
        decision: args.decision,
        reference: booking.referenceNumber ?? "",
        what: "accommodation booking",
        message: args.message,
      }),
      referenceId: args.bookingId,
      type: "agc_booking_review",
    });
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Pool overview + reallocation (SRS §29)
// ------------------------------------------------------------------

export const listPoolsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
      "finance",
    ]);
    const pools = await ctx.db.query("agcInventoryPools").collect();
    return pools
      .map((pool) => ({
        _id: pool._id,
        accommodationType: pool.accommodationType,
        scope: pool.scope,
        total: pool.total,
        reserved: pool.reserved,
        confirmed: pool.confirmed,
        available: pool.total - pool.reserved - pool.confirmed,
      }))
      .sort(
        (a, b) =>
          a.accommodationType.localeCompare(b.accommodationType) ||
          a.scope.localeCompare(b.scope),
      );
  },
});

export const reallocatePool = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    accommodationType: v.union(
      v.literal("dormitory"),
      v.literal("hostel"),
      v.literal("wise_serpents"),
      v.literal("good_general"),
      v.literal("ebpv"),
    ),
    fromScope: v.union(
      v.literal("africa"),
      v.literal("rest_of_world"),
      v.literal("global"),
    ),
    toScope: v.union(
      v.literal("africa"),
      v.literal("rest_of_world"),
      v.literal("global"),
    ),
    quantity: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
    ]);
    if (args.quantity <= 0) throw new Error("Quantity must be positive");
    if (args.fromScope === args.toScope) {
      throw new Error("Source and target pools must differ");
    }

    const fromPool = await ctx.db
      .query("agcInventoryPools")
      .withIndex("by_type_scope", (q) =>
        q
          .eq("accommodationType", args.accommodationType)
          .eq("scope", args.fromScope),
      )
      .unique();
    if (!fromPool) throw new Error("Source pool not found");
    const available = fromPool.total - fromPool.reserved - fromPool.confirmed;
    if (available < args.quantity) {
      throw new Error(
        `Source pool has only ${available} available units`,
      );
    }

    const toPool = await ctx.db
      .query("agcInventoryPools")
      .withIndex("by_type_scope", (q) =>
        q
          .eq("accommodationType", args.accommodationType)
          .eq("scope", args.toScope),
      )
      .unique();
    if (!toPool) throw new Error("Target pool not found");

    await ctx.db.patch(fromPool._id, { total: fromPool.total - args.quantity });
    await ctx.db.patch(toPool._id, { total: toPool.total + args.quantity });

    await ctx.db.insert("agcInventoryLedger", {
      poolId: fromPool._id,
      accommodationType: args.accommodationType,
      scope: args.fromScope,
      action: "reallocate",
      delta: -args.quantity,
      actorEmail: actor.email,
      note: `→ ${args.toScope}${args.note ? `: ${args.note}` : ""}`,
      createdAt: Date.now(),
    });
    await ctx.db.insert("agcInventoryLedger", {
      poolId: toPool._id,
      accommodationType: args.accommodationType,
      scope: args.toScope,
      action: "reallocate",
      delta: args.quantity,
      actorEmail: actor.email,
      note: `← ${args.fromScope}${args.note ? `: ${args.note}` : ""}`,
      createdAt: Date.now(),
    });
    await ctx.db.insert("agcReallocations", {
      accommodationType: args.accommodationType,
      fromScope: args.fromScope,
      toScope: args.toScope,
      quantity: args.quantity,
      actorEmail: actor.email,
      note: args.note,
      createdAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_pool.reallocated",
      entityType: "agcInventoryPools",
      summary: `Reallocated ${args.quantity} × ${args.accommodationType} from ${args.fromScope} to ${args.toScope}`,
    });
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Metrics (SRS §59–60)
// ------------------------------------------------------------------

export const getAgcMetrics = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
      "accommodation",
      "finance",
      "content",
    ]);

    const registrations = await ctx.db.query("agcRegistrations").collect();
    const bookings = await ctx.db.query("agcBookings").collect();
    const guests = await ctx.db.query("agcGuests").collect();

    const byStatus = (rows: { paymentStatus: string }[]) => {
      const counts: Record<string, number> = {};
      for (const row of rows) {
        counts[row.paymentStatus] = (counts[row.paymentStatus] ?? 0) + 1;
      }
      return counts;
    };

    const confirmedRevenue = registrations
      .filter((row) => row.paymentStatus === "confirmed")
      .reduce((sum, row) => sum + row.totalAmount, 0);
    const confirmedRevenueByCurrency: Record<string, number> = {};
    for (const row of registrations) {
      if (row.paymentStatus !== "confirmed") continue;
      confirmedRevenueByCurrency[row.currency] =
        (confirmedRevenueByCurrency[row.currency] ?? 0) + row.totalAmount;
    }

    return {
      registrations: {
        total: registrations.length,
        delegates: registrations.reduce((sum, row) => sum + row.quantity, 0),
        byStatus: byStatus(registrations),
        confirmedRevenue,
        confirmedRevenueByCurrency,
      },
      bookings: {
        total: bookings.length,
        byStatus: byStatus(bookings),
        activeGuests: guests.filter((guest) => guest.status === "active").length,
      },
    };
  },
});
