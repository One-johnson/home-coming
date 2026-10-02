import { v } from "convex/values";
import { ConvexError } from "convex/values";
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
import { getSmtpSettings, isSmtpConfigured } from "./lib/smtpConfig";
import {
  confirmBookingInventory,
  releaseBookingInventory,
} from "./agcAccommodation";
import {
  getAccommodationTypesConfig,
  getBishopRate,
  getPoolTotalOverrides,
} from "./lib/agcSettingsRuntime";

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
    throw new ConvexError("Unauthorized");
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
    const [typesConfig, bishopRate, pools] = await Promise.all([
      getAccommodationTypesConfig(ctx),
      getBishopRate(ctx),
      ctx.db.query("agcInventoryPools").collect(),
    ]);
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
      // Live accommodation config (defaults merged with admin overrides).
      accommodationTypes: Object.entries(typesConfig).map(
        ([type, value]) => ({ type, ...value }),
      ),
      bishopRate,
      pools: pools
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
        ),
    };
  },
});

/**
 * Super-admin system status for the Settings page: SMTP configuration
 * (read-only display, no secrets) and the event-wide lockdown state.
 */
export const getAgcSystemStatus = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    const lockdown = await ctx.db
      .query("agcSettings")
      .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.lockdown))
      .unique();
    const smtp = isSmtpConfigured()
      ? getSmtpSettings()
      : null;
    return {
      locked: lockdown?.value === "true",
      smtp: smtp
        ? {
            configured: true as const,
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            from: smtp.from,
          }
        : { configured: false as const },
    };
  },
});

/**
 * Toggle the event-wide registration lockdown (Settings danger zone). When
 * locked, every new registration and accommodation booking mutation throws;
 * existing rows are untouched. Takes effect immediately — audit-logged.
 */
export const setRegistrationLockdown = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    locked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("agcSettings")
      .withIndex("by_key", (q) => q.eq("key", AGC_SETTING_KEYS.lockdown))
      .unique();
    const value = args.locked ? "true" : "false";
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("agcSettings", {
        key: AGC_SETTING_KEYS.lockdown,
        value,
        updatedAt: Date.now(),
      });
    }
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: args.locked
        ? "agc_settings.lockdown_enabled"
        : "agc_settings.lockdown_disabled",
      entityType: "agcSettings",
      entityId: AGC_SETTING_KEYS.lockdown,
      summary: `${args.locked ? "Enabled" : "Disabled"} event-wide registration lockdown`,
    });
    return { success: true as const };
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
      v.literal("registration_lockdown"),
      v.literal("accommodation_prices"),
      v.literal("accommodation_labels"),
      v.literal("bishop_rate"),
      v.literal("pool_totals"),
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

/** Insert-or-patch an agcSettings row by key (used by admin mutations). */
async function upsertSetting(
  ctx: MutationCtx,
  key: string,
  value: string,
) {
  const existing = await ctx.db
    .query("agcSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
  } else {
    await ctx.db.insert("agcSettings", { key, value, updatedAt: Date.now() });
  }
}

/**
 * Set an inventory pool's total capacity directly (Settings → Accommodation).
 * Complements pool-to-pool reallocation. The new total must cover everything
 * already reserved + confirmed; a ledger entry + audit log record the change.
 */
export const setPoolTotal = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    poolId: v.id("agcInventoryPools"),
    total: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
    ]);
    if (!Number.isInteger(args.total) || args.total < 0) {
      throw new ConvexError("Total must be a whole number of 0 or more");
    }
    const pool = await ctx.db.get(args.poolId);
    if (!pool) throw new ConvexError("Pool not found");
    const inUse = pool.reserved + pool.confirmed;
    if (args.total < inUse) {
      throw new ConvexError(
        `Total cannot be below the ${inUse} unit(s) already reserved or confirmed in this pool`,
      );
    }
    if (args.total === pool.total) {
      return { success: true as const, changed: false };
    }

    await ctx.db.patch(pool._id, { total: args.total });
    // Persist the override so lazy seeding/imports reproduce this capacity.
    const overrides = await getPoolTotalOverrides(ctx);
    overrides[`${String(pool.accommodationType)}|${pool.scope}`] = args.total;
    await upsertSetting(ctx, AGC_SETTING_KEYS.poolTotals, JSON.stringify(overrides));

    await ctx.db.insert("agcInventoryLedger", {
      poolId: pool._id,
      accommodationType: pool.accommodationType,
      scope: pool.scope,
      action: "reallocate",
      delta: args.total - pool.total,
      actorEmail: actor.email,
      note: `total set to ${args.total}${args.note ? `: ${args.note}` : ""}`,
      createdAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_pool.total_set",
      entityType: "agcInventoryPools",
      entityId: pool._id,
      summary: `Set ${pool.accommodationType} (${pool.scope}) pool total to ${args.total}`,
    });
    return { success: true as const, changed: true };
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
      const matches = await ctx.db
        .query("agcSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .collect();
      const isBankKey =
        key === AGC_SETTING_KEYS.registrationBank ||
        key === AGC_SETTING_KEYS.accommodationBank;
      const isPlaceholder =
        isBankKey &&
        (matches.length === 1 &&
          (matches[0].value.trim() === "" ||
            matches[0].value.includes("to be configured by the Super Admin")));
      if (matches.length === 0 || isPlaceholder) {
        // Missing rows — or bank-details rows still blank/placeholder — fall
        // back to the configured defaults so reps always see payment info.
        if (matches.length === 1) {
          await ctx.db.patch(matches[0]._id, { value, updatedAt: Date.now() });
        } else {
          await ctx.db.insert("agcSettings", { key, value, updatedAt: Date.now() });
        }
      } else if (matches.length > 1) {
        // Self-heal duplicate setting keys: keep the first, drop the rest.
        const [keep, ...extras] = matches;
        for (const extra of extras) await ctx.db.delete(extra._id);
        void keep;
      }
    }

    const poolOverrides = await getPoolTotalOverrides(ctx);
    for (const seed of AGC_INVENTORY_SEED) {
      const matches = await ctx.db
        .query("agcInventoryPools")
        .withIndex("by_type_scope", (q) =>
          q
            .eq("accommodationType", seed.accommodationType)
            .eq("scope", seed.scope),
        )
        .collect();
      if (matches.length === 0) {
        // Fresh pool — an admin's pool-total override wins over the seed.
        const override =
          poolOverrides[`${String(seed.accommodationType)}|${seed.scope}`];
        await ctx.db.insert("agcInventoryPools", {
          accommodationType: seed.accommodationType,
          scope: seed.scope,
          total: override ?? seed.total,
          reserved: 0,
          confirmed: 0,
        });
      } else if (matches.length > 1) {
        // Self-heal duplicates (e.g. from overlapping imports + seed runs):
        // keep the first, absorb extras into it, then delete them.
        const [keep, ...extras] = matches;
        for (const extra of extras) {
          await ctx.db.patch(keep._id, {
            reserved: keep.reserved + extra.reserved,
            confirmed: keep.confirmed + extra.confirmed,
          });
          await ctx.db.delete(extra._id);
        }
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
    if (!name) throw new ConvexError("Hub name is required");

    const existing = await ctx.db
      .query("agcHubs")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) throw new ConvexError("A hub with this name already exists");

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
    if (!hub) throw new ConvexError("Hub not found");

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
    if (!user) throw new ConvexError("Unauthorized");
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

/**
 * Full hubs + representatives roster for the combined Excel export.
 * Only the super admin ("admin" role) may pull credential-bearing data.
 * One row per hub: the username column carries the stored account username
 * (or the derived underscore form when the hub has no rep yet), and the
 * password column carries the current temporary password while the account
 * is still pending setup; once a rep activates, their password is private
 * and the cell is intentionally left blank.
 */
export const listHubsRepsExportData = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const hubs = await ctx.db.query("agcHubs").withIndex("by_name").collect();
    const reps = await ctx.db.query("agcRepresentatives").collect();
    const repByHub = new Map<string, Doc<"agcRepresentatives">>();
    for (const rep of reps) {
      if (rep.deletedAt === undefined) repByHub.set(rep.hubId, rep);
    }
    return hubs.map((hub) => {
      const rep = repByHub.get(hub._id);
      // Mirrors agcAdmin.deriveUsername: hub name lowercased, whitespace →
      // underscores. Used as the would-be username for hubs without a rep.
      const derivedUsername = hub.name.toLowerCase().replace(/\s+/g, "_");
      return {
        hubName: hub.name,
        region: hub.region,
        country: hub.country,
        active: hub.active !== false,
        username: rep?.username ?? derivedUsername,
        repStatus: rep?.status ?? "no_rep",
        password: rep?.status === "pending_setup" ? (rep.tempPassword ?? "") : "",
        email: rep?.email ?? "",
        profileComplete: rep?.profileComplete ?? false,
        createdAt: rep?.createdAt ?? hub.createdAt,
      };
    });
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
      .filter((rep) => rep.deletedAt === undefined)
      .map((rep) => ({
        _id: rep._id,
        username: rep.username,
        hubId: rep.hubId,
        hubName: hubById.get(rep.hubId)?.name ?? "(unknown hub)",
        email: rep.email ?? null,
        profileComplete: rep.profileComplete,
        status: rep.status,
        // Only exposed while the temporary password is still valid.
        tempPassword: rep.tempPassword ?? null,
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
    // Exclude soft-deleted reps so bulk creation can reuse those usernames.
    return (await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username")
      .collect()).filter((rep) => rep.deletedAt === undefined);
  },
});

export const insertRep = internalMutation({
  args: {
    hubId: v.id("agcHubs"),
    username: v.string(),
    passwordHash: v.string(),
    tempPassword: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("agcRepresentatives", {
      hubId: args.hubId,
      username: args.username,
      email: args.email,
      passwordHash: args.passwordHash,
      tempPassword: args.tempPassword,
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
    /** New temporary password to display on admin cards / exports. */
    tempPassword: v.optional(v.string()),
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
      tempPassword: args.tempPassword,
      mustChangePassword: true,
      profileComplete: false,
      status: "pending_setup",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Reps soft-deleted more than this long ago are purged permanently by cron.
 */
export const REP_SOFT_DELETE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Shared soft-delete: kills sessions/reset tokens/throttle rows and marks the
 * rep deleted. The record lingers for REP_SOFT_DELETE_TTL_MS so an admin can
 * undo; the cron purge removes it permanently afterwards.
 */
async function deleteRepInternal(
  ctx: MutationCtx,
  repId: Id<"agcRepresentatives">,
  actorEmail: string,
) {
  const sessions = await ctx.db
    .query("agcRepSessions")
    .withIndex("by_rep", (q) => q.eq("repId", repId))
    .collect();
  for (const session of sessions) {
    await ctx.db.delete(session._id);
  }
  const resets = await ctx.db
    .query("agcPasswordResets")
    .withIndex("by_rep", (q) => q.eq("repId", repId))
    .collect();
  for (const reset of resets) {
    await ctx.db.delete(reset._id);
  }
  const rep = await ctx.db.get(repId);
  if (rep) {
    const throttleRow = await ctx.db
      .query("agcLoginThrottle")
      .withIndex("by_key", (q) => q.eq("key", rep.username.toLowerCase()))
      .unique();
    if (throttleRow) {
      await ctx.db.delete(throttleRow._id);
    }
    await ctx.db.patch(repId, {
      deletedAt: Date.now(),
      deletedBy: actorEmail,
      status: "disabled",
      updatedAt: Date.now(),
    });
  }
}

/**
 * Permanently remove a soft-deleted rep (cron purge or explicit). Cascades
 * session/reset-token cleanup; the hub record is always kept.
 */
async function purgeRepInternal(ctx: MutationCtx, repId: Id<"agcRepresentatives">) {
  const sessions = await ctx.db
    .query("agcRepSessions")
    .withIndex("by_rep", (q) => q.eq("repId", repId))
    .collect();
  for (const session of sessions) {
    await ctx.db.delete(session._id);
  }
  const resets = await ctx.db
    .query("agcPasswordResets")
    .withIndex("by_rep", (q) => q.eq("repId", repId))
    .collect();
  for (const reset of resets) {
    await ctx.db.delete(reset._id);
  }
  await ctx.db.delete(repId);
}

export const setRepEmail = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    repId: v.id("agcRepresentatives"),
    /** Empty string clears the email. */
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.db.get(args.repId);
    if (!rep) throw new ConvexError("Representative not found");

    const email = args.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Please enter a valid email address");
    }
    if (email) {
      const taken: Doc<"agcRepresentatives"> | null = await ctx.db
        .query("agcRepresentatives")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (taken && taken._id !== rep._id) {
        throw new ConvexError("This email address is already in use by another representative");
      }
    }

    await ctx.db.patch(args.repId, {
      email: email || undefined,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorEmail: actor.email,
      action: "agc_rep.email_updated",
      entityType: "agcRepresentatives",
      entityId: args.repId,
      summary: `Set email for ${rep.username}${email ? ` to ${email}` : " (cleared)"}`,
    });

    return { success: true as const };
  },
});

export const deleteRep = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    repId: v.id("agcRepresentatives"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.db.get(args.repId);
    if (!rep) throw new ConvexError("Representative not found");
    if (rep.deletedAt) throw new ConvexError("Representative is already deleted");

    await deleteRepInternal(ctx, args.repId, actor.email);

    await writeAuditLog(ctx, {
      actorEmail: actor.email,
      action: "agc_rep.deleted",
      entityType: "agcRepresentatives",
      entityId: args.repId,
      summary: `Deleted representative account ${rep.username} (${rep.email ?? "no email"}) — restorable for 7 days`,
    });

    return {
      success: true as const,
      username: rep.username,
      /** When the soft-deleted record becomes unrecoverable. */
      purgeAt: Date.now() + REP_SOFT_DELETE_TTL_MS,
    };
  },
});

export const deleteRepsBulk = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    repIds: v.array(v.id("agcRepresentatives")),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);

    let deleted = 0;
    const usernames: string[] = [];
    const missing: string[] = [];
    for (const repId of args.repIds) {
      const rep = await ctx.db.get(repId);
      if (!rep || rep.deletedAt) {
        missing.push(repId);
        continue;
      }
      usernames.push(rep.username);
      await deleteRepInternal(ctx, repId, actor.email);
      deleted += 1;
    }

    await writeAuditLog(ctx, {
      actorEmail: actor.email,
      action: "agc_rep.bulk_deleted",
      entityType: "agcRepresentatives",
      summary: `Bulk-deleted ${deleted} representative account(s): ${usernames.join(", ") || "none"} — restorable for 7 days`,
    });

    return { deleted, missing };
  },
});

/** Undo a soft delete: the rep returns with sessions/reset tokens wiped. */
export const restoreRep = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    repId: v.id("agcRepresentatives"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.db.get(args.repId);
    if (!rep) throw new ConvexError("Representative not found");
    if (!rep.deletedAt) throw new ConvexError("This representative is not deleted");

    // Guard against username/email collisions with reps created after the
    // delete. Uses collect() so stray duplicate rows cannot crash the check.
    const usernameClash = (
      await ctx.db
        .query("agcRepresentatives")
        .withIndex("by_username", (q) => q.eq("username", rep.username))
        .collect()
    ).find(
      (row) => row._id !== rep._id && row.deletedAt === undefined,
    );
    if (usernameClash) {
      throw new ConvexError(
        `Cannot restore: a new account for "${rep.username}" already exists. Delete it first.`,
      );
    }
    if (rep.email) {
      const emailClash = (
        await ctx.db
          .query("agcRepresentatives")
          .withIndex("by_email", (q) => q.eq("email", rep.email))
          .collect()
      ).find(
        (row) => row._id !== rep._id && row.deletedAt === undefined,
      );
      if (emailClash) {
        throw new ConvexError(
          `Cannot restore: the email ${rep.email} is now used by another account.`,
        );
      }
    }

    await ctx.db.patch(args.repId, {
      deletedAt: undefined,
      deletedBy: undefined,
      status: "pending_setup",
      mustChangePassword: true,
      profileComplete: false,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorEmail: actor.email,
      action: "agc_rep.restored",
      entityType: "agcRepresentatives",
      entityId: args.repId,
      summary: `Restored deleted representative account ${rep.username} — first-time setup required again`,
    });

    return { success: true as const };
  },
});

/** Soft-deleted reps that can still be restored, for the admin UI. */
export const listDeletedReps = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const now = Date.now();
    const reps = (await ctx.db.query("agcRepresentatives").collect()).filter(
      (rep) => rep.deletedAt !== undefined,
    );
    const hubs = await ctx.db.query("agcHubs").collect();
    const hubById = new Map(hubs.map((hub) => [hub._id, hub]));
    return reps
      .map((rep) => ({
        _id: rep._id,
        username: rep.username,
        hubName: hubById.get(rep.hubId)?.name ?? "(unknown hub)",
        email: rep.email ?? null,
        deletedAt: rep.deletedAt!,
        deletedBy: rep.deletedBy ?? null,
        purgeAt: rep.deletedAt! + REP_SOFT_DELETE_TTL_MS,
        expired: rep.deletedAt! + REP_SOFT_DELETE_TTL_MS < now,
      }))
      .sort((a, b) => b.deletedAt - a.deletedAt);
  },
});

/** Cron tick: permanently purge soft-deleted reps past the 7-day window. */
export const purgeExpiredDeletedReps = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - REP_SOFT_DELETE_TTL_MS;
    const expired = (await ctx.db.query("agcRepresentatives").collect()).filter(
      (rep) => rep.deletedAt !== undefined && rep.deletedAt < cutoff,
    );
    for (const rep of expired) {
      await purgeRepInternal(ctx, rep._id);
    }
    return { purged: expired.length };
  },
});

/**
 * Notify every platform admin that a payment is awaiting review.
 * Returns one email log per admin (stub status when SMTP is unconfigured),
 * so the caller can schedule delivery for each.
 */
export const notifyAdminsOfPendingReview = internalMutation({
  args: {
    kind: v.union(v.literal("registration"), v.literal("booking")),
    referenceNumber: v.optional(v.string()),
    hubName: v.string(),
    amount: v.number(),
    currency: v.string(),
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const admins = await ctx.db
      .query("users")
      .withIndex("by_email")
      .collect();
    const label = args.kind === "registration" ? "Registration" : "Accommodation booking";
    const subject = `Homecoming 2026 — ${label} awaiting review (${args.referenceNumber ?? args.hubName})`;
    const body = [
      "A payment was submitted and is waiting for review in the AGC console.",
      "",
      `${label}: ${args.referenceNumber ?? "(no reference yet)"}`,
      `Hub: ${args.hubName}`,
      `Amount: ${args.currency} ${args.amount}`,
      "",
      "Open the admin dashboard → AGC 2026 to approve or request a correction.",
      "",
      "— Homecoming 2026 automated notification",
    ].join("\n");

    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    const queued: { emailLogId: Id<"emailLogs">; shouldSend: boolean }[] = [];
    for (const admin of admins) {
      if (!admin.email || admin.active === false) continue;
      const emailLogId: Id<"emailLogs"> = await ctx.db.insert("emailLogs", {
        to: admin.email,
        subject,
        body,
        type: "agc_admin_pending_review",
        referenceId: args.recordId,
        status,
        createdAt: Date.now(),
      });
      queued.push({ emailLogId, shouldSend: status === "pending" });
    }
    return queued;
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
    if (!rep) throw new ConvexError("Representative not found");

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
    if (!record) throw new ConvexError("Registration not found");

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
    if (!booking) throw new ConvexError("Booking not found");

    if (args.decision === "approve") {
      if (booking.bookingStatus === "expired" || booking.bookingStatus === "cancelled") {
        throw new ConvexError("This booking is no longer active");
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
      await confirmBookingInventory(ctx, args.bookingId);
    } else if (args.decision === "reject") {
      if (booking.bookingStatus === "reserved") {
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
// Admin delete operations (single + bulk) — hard deletes, audit-logged.
// Registrations: erases the row and its offline receipt blob. Bookings:
// mirrors the rep-side delete (agcBookings.deleteBooking) — returns held
// units to their pools, then removes lines, guests, ledger entries, the
// receipt blob, and the booking row itself.
// ------------------------------------------------------------------

const MAX_BULK_DELETE = 200;

async function deleteRegistrationRecord(
  ctx: MutationCtx,
  record: Doc<"agcRegistrations">,
) {
  if (record.offline?.receiptStorageId) {
    await ctx.storage.delete(record.offline.receiptStorageId);
  }
  await ctx.db.delete(record._id);
}

async function deleteBookingRecord(
  ctx: MutationCtx,
  booking: Doc<"agcBookings">,
) {
  // Reserved holds return their units before the lines disappear.
  if (booking.bookingStatus === "reserved") {
    await releaseBookingInventory(ctx, booking, "cancel");
  }
  for (const line of await ctx.db
    .query("agcBookingLines")
    .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
    .collect()) {
    await ctx.db.delete(line._id);
  }
  for (const guest of await ctx.db
    .query("agcGuests")
    .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
    .collect()) {
    await ctx.db.delete(guest._id);
  }
  // Ledger has no booking index; sweep by bookingId.
  for (const entry of await ctx.db.query("agcInventoryLedger").collect()) {
    if (entry.bookingId === booking._id) await ctx.db.delete(entry._id);
  }
  if (booking.offline?.receiptStorageId) {
    await ctx.storage.delete(booking.offline.receiptStorageId);
  }
  await ctx.db.delete(booking._id);
}

export const deleteAgcRegistration = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    registrationId: v.id("agcRegistrations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
      "finance",
    ]);
    const record = await ctx.db.get(args.registrationId);
    if (!record) throw new ConvexError("Registration not found");

    await deleteRegistrationRecord(ctx, record);

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_registration.deleted",
      entityType: "agcRegistrations",
      entityId: args.registrationId,
      summary: `Deleted registration ${record.referenceNumber ?? ""} by ${actor.email}`,
    });
    return { success: true as const };
  },
});

export const deleteAgcRegistrationsBulk = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("agcRegistrations")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
      "finance",
    ]);
    if (args.ids.length === 0) {
      throw new ConvexError("Select at least one registration");
    }
    if (args.ids.length > MAX_BULK_DELETE) {
      throw new ConvexError(`Delete at most ${MAX_BULK_DELETE} registrations at a time`);
    }

    let deleted = 0;
    for (const id of args.ids) {
      const record = await ctx.db.get(id);
      if (!record) continue;
      await deleteRegistrationRecord(ctx, record);
      deleted += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_registration.bulk_deleted",
      entityType: "agcRegistrations",
      summary: `Bulk deleted ${deleted} registration(s) by ${actor.email}`,
      metadata: { count: deleted },
    });
    return { deleted };
  },
});

export const deleteAgcBooking = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    bookingId: v.id("agcBookings"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
      "finance",
    ]);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new ConvexError("Booking not found");

    await deleteBookingRecord(ctx, booking);

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_booking.deleted",
      entityType: "agcBookings",
      entityId: args.bookingId,
      summary: `Deleted booking ${booking.referenceNumber ?? ""} by ${actor.email}`,
    });
    return { success: true as const };
  },
});

export const deleteAgcBookingsBulk = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    ids: v.array(v.id("agcBookings")),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
      "finance",
    ]);
    if (args.ids.length === 0) {
      throw new ConvexError("Select at least one booking");
    }
    if (args.ids.length > MAX_BULK_DELETE) {
      throw new ConvexError(`Delete at most ${MAX_BULK_DELETE} bookings at a time`);
    }

    let deleted = 0;
    for (const id of args.ids) {
      const booking = await ctx.db.get(id);
      if (!booking) continue;
      await deleteBookingRecord(ctx, booking);
      deleted += 1;
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_booking.bulk_deleted",
      entityType: "agcBookings",
      summary: `Bulk deleted ${deleted} booking(s) by ${actor.email}`,
      metadata: { count: deleted },
    });
    return { deleted };
  },
});

// ------------------------------------------------------------------
// Dashboard overview — AGC data only (the legacy public-registration
// tables are no longer the source of truth).
// ------------------------------------------------------------------

/**
 * File-storage usage from Convex's system `_storage` table: total bytes,
 * file count, and a breakdown by which feature owns each blob (derived
 * from the metadata rows that reference the storage id).
 * Returns zeros when the caller lacks the "emails" (admin) area.
 *
 * Curated gallery photos are repo-hosted static files (public/gallery) and
 * intentionally do not appear here — their storage cost is zero. Receipts,
 * hero, and tour images still live in Convex storage.
 */
async function storageUsage(ctx: QueryCtx, canSee: boolean) {
  if (!canSee) {
    return {
      totalBytes: 0,
      fileCount: 0,
      galleryFiles: 0,
      receiptFiles: 0,
      heroTourFiles: 0,
      otherFiles: 0,
    };
  }

  const blobs = await ctx.db.system.query("_storage").collect();
  const blobById = new Map<string, { _id: string; size: number }>(
    blobs.map((b) => [b._id, { _id: b._id, size: b.size }]),
  );

  const usedBy = new Set<string>();
  for (const image of await ctx.db.query("galleryImages").collect()) {
    if (image.storageId) usedBy.add(image.storageId);
  }
  for (const gallery of await ctx.db.query("galleries").collect()) {
    if (gallery.coverStorageId) usedBy.add(gallery.coverStorageId);
  }
  const galleryIds = new Set(usedBy);

  const receiptIds = new Set<string>();
  for (const reg of await ctx.db.query("agcRegistrations").collect()) {
    if (reg.offline?.receiptStorageId) receiptIds.add(reg.offline.receiptStorageId);
  }
  for (const booking of await ctx.db.query("agcBookings").collect()) {
    if (booking.offline?.receiptStorageId) receiptIds.add(booking.offline.receiptStorageId);
  }

  const heroTourIds = new Set<string>();
  for (const slide of await ctx.db.query("heroSlides").collect()) {
    if (slide.storageId) heroTourIds.add(slide.storageId);
  }
  for (const pkg of await ctx.db.query("tourPackages").collect()) {
    if (pkg.imageStorageId) heroTourIds.add(pkg.imageStorageId);
  }

  let totalBytes = 0;
  let galleryFiles = 0;
  let receiptFiles = 0;
  let heroTourFiles = 0;
  let otherFiles = 0;
  for (const blob of blobById.values()) {
    totalBytes += blob.size;
    if (galleryIds.has(blob._id)) galleryFiles += 1;
    else if (receiptIds.has(blob._id)) receiptFiles += 1;
    else if (heroTourIds.has(blob._id)) heroTourFiles += 1;
    else otherFiles += 1;
  }

  return {
    totalBytes,
    fileCount: blobs.length,
    galleryFiles,
    receiptFiles,
    heroTourFiles,
    otherFiles,
  };
}

export const getAgcOverview = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
      "accommodation",
      "finance",
      "content",
    ]);

    const canRegistration =
      user.role === "admin" || user.role === "registration";
    const canAccommodation =
      user.role === "admin" || user.role === "accommodation";
    const canContent = user.role === "admin" || user.role === "content";
    const canEmails = user.role === "admin";

    const registrations = canRegistration
      ? await ctx.db.query("agcRegistrations").collect()
      : [];
    const bookings = canAccommodation
      ? await ctx.db.query("agcBookings").collect()
      : [];
    const guests = canAccommodation
      ? await ctx.db.query("agcGuests").collect()
      : [];
    const pools = canAccommodation
      ? await ctx.db.query("agcInventoryPools").collect()
      : [];
    const emailLogs = canEmails
      ? await ctx.db.query("emailLogs").collect()
      : [];
    const recentActivity =
      user.role === "admin"
        ? (
            await ctx.db
              .query("auditLogs")
              .withIndex("by_created_at")
              .order("desc")
              .take(8)
          ).map((log) => ({
            _id: log._id,
            action: log.action,
            summary: log.summary,
            actorEmail: log.actorEmail,
            createdAt: log.createdAt,
          }))
        : [];

    const hubName = new Map<string, string>();
    if (canRegistration) {
      for (const hub of await ctx.db.query("agcHubs").collect()) {
        hubName.set(hub._id, hub.name);
      }
    }

    const confirmedRegistrations = registrations.filter(
      (row) => row.paymentStatus === "confirmed",
    );
    const pendingRegistrations = registrations.filter(
      (row) => row.paymentStatus === "pending_verification",
    );
    const rejectedRegistrations = registrations.filter(
      (row) => row.paymentStatus === "rejected",
    );
    const registrationRevenueByCurrency: Record<string, number> = {};
    for (const row of confirmedRegistrations) {
      registrationRevenueByCurrency[row.currency] =
        (registrationRevenueByCurrency[row.currency] ?? 0) + row.totalAmount;
    }

    const confirmedBookings = bookings.filter(
      (row) => row.paymentStatus === "confirmed",
    );
    const pendingBookings = bookings.filter(
      (row) =>
        row.paymentStatus === "pending_verification" ||
        row.bookingStatus === "pending_verification",
    );
    const bookingRevenueByCurrency: Record<string, number> = {};
    for (const row of confirmedBookings) {
      bookingRevenueByCurrency[row.currency] =
        (bookingRevenueByCurrency[row.currency] ?? 0) + row.totalAmount;
    }

    const regionBreakdown: Record<string, number> = {};
    for (const row of registrations) {
      regionBreakdown[row.region] = (regionBreakdown[row.region] ?? 0) + 1;
    }
    const modeBreakdown: Record<string, number> = {};
    for (const row of registrations) {
      modeBreakdown[row.paymentMode] = (modeBreakdown[row.paymentMode] ?? 0) + 1;
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const thisWeekStart = now - weekMs;
    const lastWeekStart = now - 2 * weekMs;
    const registrationsThisWeek = registrations.filter(
      (row) => row.createdAt >= thisWeekStart,
    ).length;
    const registrationsLastWeek = registrations.filter(
      (row) => row.createdAt >= lastWeekStart && row.createdAt < thisWeekStart,
    ).length;
    const bookingsThisWeek = bookings.filter(
      (row) => row.createdAt >= thisWeekStart,
    ).length;

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const start = now - (6 - i) * dayMs;
      const dayStart = new Date(start);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + dayMs;
      const count = registrations.filter(
        (row) => row.createdAt >= dayStart.getTime() && row.createdAt < dayEnd,
      ).length;
      return {
        label: dayStart.toLocaleDateString(undefined, { weekday: "short" }),
        count,
      };
    });

    const formatMoney = (byCurrency: Record<string, number>) =>
      Object.entries(byCurrency)
        .map(([currency, amount]) => `${currency} ${amount.toLocaleString()}`)
        .join(" · ") || "—";

    // Capacity from the AGC inventory pools (the source the booking flow uses).
    const poolTotals = new Map<
      string,
      { total: number; reserved: number; confirmed: number }
    >();
    for (const pool of pools) {
      const key = String(pool.accommodationType);
      const agg = poolTotals.get(key) ?? { total: 0, reserved: 0, confirmed: 0 };
      agg.total += pool.total;
      agg.reserved += pool.reserved;
      agg.confirmed += pool.confirmed;
      poolTotals.set(key, agg);
    }
    const housing = [...poolTotals.entries()]
      .map(([type, agg]) => ({
        _id: type,
        type,
        capacityLimit: agg.total,
        booked: agg.reserved + agg.confirmed,
        remaining: Math.max(0, agg.total - agg.reserved - agg.confirmed),
        pricePerStay: 0,
      }))
      .sort((a, b) => a.type.localeCompare(b.type));

    const attention: {
      id: string;
      label: string;
      detail: string;
      href: string;
      tone: "warn" | "danger" | "info";
    }[] = [];

    if (canRegistration && pendingRegistrations.length > 0) {
      attention.push({
        id: "agc-reg-pending",
        label: "Registrations awaiting review",
        detail: `${pendingRegistrations.length} payment receipt${pendingRegistrations.length === 1 ? "" : "s"} to verify`,
        href: "/admin/agc",
        tone: "warn",
      });
    }
    if (canAccommodation && pendingBookings.length > 0) {
      attention.push({
        id: "agc-booking-pending",
        label: "Bookings awaiting review",
        detail: `${pendingBookings.length} accommodation payment${pendingBookings.length === 1 ? "" : "s"} to verify`,
        href: "/admin/agc",
        tone: "warn",
      });
    }
    if (canRegistration && rejectedRegistrations.length > 0) {
      attention.push({
        id: "agc-reg-rejected",
        label: "Rejected registrations",
        detail: `${rejectedRegistrations.length} submission${rejectedRegistrations.length === 1 ? "" : "s"} were rejected`,
        href: "/admin/agc",
        tone: "info",
      });
    }
    if (
      canAccommodation &&
      housing.some((row) => row.capacityLimit > 0 && row.remaining <= 5)
    ) {
      attention.push({
        id: "agc-pools-low",
        label: "Low accommodation capacity",
        detail: housing
          .filter((row) => row.capacityLimit > 0 && row.remaining <= 5)
          .map((row) => `${row.type}: ${row.remaining} left`)
          .join(" · "),
        href: "/admin/agc",
        tone: "info",
      });
    }
    if (canEmails) {
      const failedEmails = emailLogs.filter((e) => e.status === "failed").length;
      const pendingEmails = emailLogs.filter((e) => e.status === "pending").length;
      if (failedEmails > 0) {
        attention.push({
          id: "email-failed",
          label: "Failed emails",
          detail: `${failedEmails} email${failedEmails === 1 ? "" : "s"} failed to send`,
          href: "/admin/emails",
          tone: "danger",
        });
      } else if (pendingEmails > 0) {
        attention.push({
          id: "email-pending",
          label: "Pending emails",
          detail: `${pendingEmails} email${pendingEmails === 1 ? "" : "s"} awaiting delivery`,
          href: "/admin/emails",
          tone: "info",
        });
      }
    }

    return {
      registrations: {
        total: registrations.length,
        delegates: registrations.reduce((sum, row) => sum + row.quantity, 0),
        confirmed: confirmedRegistrations.length,
        pending: pendingRegistrations.length,
        rejected: rejectedRegistrations.length,
        revenueByCurrency: registrationRevenueByCurrency,
        revenueLabel: formatMoney(registrationRevenueByCurrency),
        thisWeek: registrationsThisWeek,
        lastWeek: registrationsLastWeek,
        regionBreakdown,
        modeBreakdown,
        last7Days,
      },
      bookings: {
        total: bookings.length,
        activeGuests: guests.filter((guest) => guest.status === "active").length,
        confirmed: confirmedBookings.length,
        pending: pendingBookings.length,
        revenueLabel: formatMoney(bookingRevenueByCurrency),
        thisWeek: bookingsThisWeek,
      },
      housing,
      content: {
        faqs: canContent
          ? (await ctx.db.query("faqs").collect()).length
          : 0,
        videos: canContent
          ? (await ctx.db.query("messages").collect()).length
          : 0,
      },
      emails: {
        total: emailLogs.length,
        pending: emailLogs.filter((e) => e.status === "pending").length,
        stub: emailLogs.filter((e) => e.status === "stub").length,
        sent: emailLogs.filter((e) => e.status === "sent").length,
        failed: emailLogs.filter((e) => e.status === "failed").length,
      },
      storage: await storageUsage(ctx, canEmails),
      attention,
      recentActivity,
      badges: {
        registrationsPending: pendingRegistrations.length,
        bookingsPending: pendingBookings.length,
        emailsFailed: emailLogs.filter((e) => e.status === "failed").length,
      },
    };
  },
});

/**
 * Per-hub drill-down: one row per hub with its rep account status and
 * registration/booking activity, for the dedicated Hubs & reps view.
 */
export const getHubRoster = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [
      "admin",
      "registration",
      "accommodation",
      "finance",
    ]);

    const hubs = await ctx.db.query("agcHubs").collect();
    const reps = (await ctx.db.query("agcRepresentatives").collect()).filter(
      (rep) => rep.deletedAt === undefined,
    );
    const registrations = await ctx.db.query("agcRegistrations").collect();
    const bookings = await ctx.db.query("agcBookings").collect();

    const repByHub = new Map<string, Doc<"agcRepresentatives">>();
    for (const rep of reps) {
      repByHub.set(rep.hubId, rep);
    }

    const regsByHub = new Map<string, Doc<"agcRegistrations">[]>();
    for (const reg of registrations) {
      const list = regsByHub.get(reg.hubId) ?? [];
      list.push(reg);
      regsByHub.set(reg.hubId, list);
    }
    const bookingsByHub = new Map<string, Doc<"agcBookings">[]>();
    for (const booking of bookings) {
      const list = bookingsByHub.get(booking.hubId) ?? [];
      list.push(booking);
      bookingsByHub.set(booking.hubId, list);
    }

    const now = Date.now();
    return hubs
      .map((hub) => {
        const rep = repByHub.get(hub._id);
        const regs = regsByHub.get(hub._id) ?? [];
        const hubBookings = bookingsByHub.get(hub._id) ?? [];
        const pendingRegs = regs.filter(
          (r) => r.paymentStatus === "pending_verification",
        ).length;
        const confirmedRegs = regs.filter(
          (r) => r.paymentStatus === "confirmed",
        ).length;
        const pendingBookings = hubBookings.filter(
          (b) =>
            b.paymentStatus === "pending_verification" ||
            b.bookingStatus === "pending_verification",
        ).length;
        const confirmedBookings = hubBookings.filter(
          (b) => b.paymentStatus === "confirmed",
        ).length;
        return {
          _id: hub._id,
          hubName: hub.name,
          region: hub.region,
          country: hub.country,
          active: hub.active !== false,
          rep: rep
            ? {
                _id: rep._id,
                username: rep.username,
                email: rep.email ?? null,
                status: rep.status,
                profileComplete: rep.profileComplete,
              }
            : null,
          registrations: {
            total: regs.length,
            confirmed: confirmedRegs,
            pending: pendingRegs,
            delegates: regs.reduce((sum, r) => sum + r.quantity, 0),
            lastActivityAt: regs.reduce<number>(
              (latest, r) => Math.max(latest, r.createdAt),
              0,
            ),
          },
          bookings: {
            total: hubBookings.length,
            confirmed: confirmedBookings,
            pending: pendingBookings,
            lastActivityAt: hubBookings.reduce<number>(
              (latest, b) => Math.max(latest, b.createdAt),
              0,
            ),
          },
          // A hub with recent pending work floats up for attention.
          needsAttention:
            pendingRegs + pendingBookings > 0 ||
            (rep === undefined && hub.active !== false),
          inactiveDays: Math.floor(
            (now - Math.max(
              regs.reduce<number>((latest, r) => Math.max(latest, r.createdAt), 0),
              hubBookings.reduce<number>(
                (latest, b) => Math.max(latest, b.createdAt),
                0,
              ),
            )) /
              (1000 * 60 * 60 * 24),
          ),
        };
      })
      .sort(
        (a, b) =>
          Number(b.needsAttention) - Number(a.needsAttention) ||
          b.registrations.delegates - a.registrations.delegates ||
          a.hubName.localeCompare(b.hubName),
      );
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
    if (args.quantity <= 0) throw new ConvexError("Quantity must be positive");
    if (args.fromScope === args.toScope) {
      throw new ConvexError("Source and target pools must differ");
    }

    const fromPool = await ctx.db
      .query("agcInventoryPools")
      .withIndex("by_type_scope", (q) =>
        q
          .eq("accommodationType", args.accommodationType)
          .eq("scope", args.fromScope),
      )
      .unique();
    if (!fromPool) throw new ConvexError("Source pool not found");
    const available = fromPool.total - fromPool.reserved - fromPool.confirmed;
    if (available < args.quantity) {
      throw new ConvexError(
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
    if (!toPool) throw new ConvexError("Target pool not found");

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
