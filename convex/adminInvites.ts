import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin, sessionTokenValidator } from "./users";
import { writeAuditLog } from "./lib/audit";

/**
 * Admin-issued invite codes for the public /admin/register page.
 *
 * The register page used to be open only while no users existed (bootstrap).
 * Invites let additional admins sign up safely: a code is required, it can
 * be locked to one email address, it expires, and it is consumed on use.
 */

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // default 7 days
/** Cap on simultaneously-active invites to keep the surface small. */
const MAX_ACTIVE_INVITES = 20;

function normalizeCode(code: string) {
  return code.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const createInvite = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    role: v.union(
      v.literal("admin"),
      v.literal("content"),
      v.literal("finance"),
      v.literal("registration"),
      v.literal("accommodation"),
    ),
    /** Optional email lock: only this address may redeem the code. */
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const email = args.email?.trim().toLowerCase() || undefined;
    if (email && !isValidEmail(email)) {
      throw new ConvexError("Please enter a valid email address");
    }

    const now = Date.now();
    const all = await ctx.db.query("adminInvites").collect();
    const activeCount = all.filter(
      (invite) =>
        !invite.usedAt && !invite.revokedAt && invite.expiresAt > now,
    ).length;
    if (activeCount >= MAX_ACTIVE_INVITES) {
      throw new ConvexError(
        "Too many active invites — revoke unused ones first",
      );
    }

    // 32 hex chars = 128 bits of entropy (crypto is available in mutations).
    const code = crypto.randomUUID().replace(/-/g, "");

    const inviteId = await ctx.db.insert("adminInvites", {
      code,
      role: args.role,
      email,
      expiresAt: now + INVITE_TTL_MS,
      createdBy: actor._id,
      createdAt: now,
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "admin_invite.created",
      entityType: "adminInvites",
      entityId: inviteId,
      summary: `Created ${args.role} invite${email ? ` for ${email}` : ""}`,
    });

    return { id: inviteId, code, role: args.role, email: email ?? null };
  },
});

export const listInvites = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("adminInvites")
      .withIndex("by_created_at")
      .order("desc")
      .take(50);
    const now = Date.now();
    return rows.map((row) => ({
      _id: row._id,
      code: row.code,
      role: row.role,
      email: row.email ?? null,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt ?? null,
      revokedAt: row.revokedAt ?? null,
      status: (row.revokedAt !== undefined
        ? "revoked"
        : row.usedAt !== undefined
          ? "used"
          : row.expiresAt <= now
            ? "expired"
            : "active") as "revoked" | "used" | "expired" | "active",
    }));
  },
});

export const revokeInvite = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    inviteId: v.id("adminInvites"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new ConvexError("Invite not found");
    if (invite.usedAt !== undefined) {
      throw new ConvexError("Invite already used");
    }
    if (invite.revokedAt === undefined) {
      await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "admin_invite.revoked",
        entityType: "adminInvites",
        entityId: args.inviteId,
        summary: `Revoked ${invite.role} invite`,
      });
    }
    return { success: true as const };
  },
});

// ------------------------------------------------------------------
// Internal helpers used by authActions.registerWithInvite
// ------------------------------------------------------------------

export const validateInviteInternal = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("adminInvites")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(args.code)))
      .unique();
    if (!invite) {
      return { valid: false as const, reason: "Registration code not found" };
    }
    if (invite.revokedAt !== undefined) {
      return {
        valid: false as const,
        reason: "This registration code has been revoked",
      };
    }
    if (invite.usedAt !== undefined) {
      return {
        valid: false as const,
        reason: "This registration code has already been used",
      };
    }
    if (invite.expiresAt <= Date.now()) {
      return {
        valid: false as const,
        reason: "This registration code has expired",
      };
    }
    return {
      valid: true as const,
      inviteId: invite._id,
      role: invite.role,
      email: invite.email ?? null,
    };
  },
});

/** Mark the code used. Throws when the code was consumed/revoked meanwhile. */
export const consumeInviteInternal = internalMutation({
  args: {
    inviteId: v.id("adminInvites"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.usedAt !== undefined || invite.revokedAt !== undefined) {
      throw new ConvexError("Registration code is no longer valid");
    }
    await ctx.db.patch(args.inviteId, {
      usedBy: args.userId,
      usedAt: Date.now(),
    });
  },
});
