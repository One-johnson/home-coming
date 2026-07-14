import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const ADMIN_ROLES = [
  "admin",
  "content",
  "registration",
  "accommodation",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminArea =
  | "registration"
  | "accommodation"
  | "content"
  | "emails"
  | "team"
  | "seed"
  | "audit";

export const AREA_ROLES: Record<AdminArea, readonly AdminRole[]> = {
  registration: ["admin", "registration"],
  accommodation: ["admin", "accommodation"],
  content: ["admin", "content"],
  emails: ["admin"],
  team: ["admin"],
  seed: ["admin"],
  audit: ["admin"],
};

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const adminRoleValidator = v.union(
  v.literal("admin"),
  v.literal("content"),
  v.literal("registration"),
  v.literal("accommodation"),
);

export const sessionTokenValidator = v.string();

type Ctx = QueryCtx | MutationCtx;

export function isAdminRole(role: string | undefined | null): role is AdminRole {
  return (
    role === "admin" ||
    role === "content" ||
    role === "registration" ||
    role === "accommodation"
  );
}

export function canAccessArea(
  role: string | undefined | null,
  area: AdminArea,
): boolean {
  if (!isAdminRole(role)) return false;
  return AREA_ROLES[area].includes(role);
}

function publicUser(user: Doc<"users">) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    disabledAt: user.disabledAt ?? null,
    createdAt: user.createdAt,
  };
}

export async function getUserBySessionToken(ctx: Ctx, sessionToken: string) {
  if (!sessionToken.trim()) return null;

  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .unique();

  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;

  const user = await ctx.db.get(session.userId);
  if (!user || user.active === false) return null;
  return user;
}

export async function requireRole(
  ctx: Ctx,
  sessionToken: string,
  allowedRoles: AdminRole[],
) {
  const user = await getUserBySessionToken(ctx, sessionToken);
  if (!user || user.active === false || !allowedRoles.includes(user.role)) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireAdmin(ctx: Ctx, sessionToken: string) {
  return await requireRole(ctx, sessionToken, ["admin"]);
}

export async function requireAnyRole(ctx: Ctx, sessionToken: string) {
  return await requireRole(ctx, sessionToken, [...ADMIN_ROLES]);
}

async function countAdmins(ctx: Ctx) {
  const users = await ctx.db.query("users").collect();
  return users.filter((u) => u.role === "admin" && u.active !== false).length;
}

async function assertNotRemovingLastAdmin(
  ctx: Ctx,
  target: Doc<"users">,
  nextRole: AdminRole | null,
) {
  if (target.role !== "admin") return;
  if (nextRole === "admin") return;

  const adminCount = await countAdmins(ctx);
  if (adminCount <= 1) {
    throw new Error("Cannot remove or demote the last admin");
  }
}

export const canRegisterAdmin = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.length === 0;
  },
});

export const currentUser = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.sessionToken);
    return user ? publicUser(user) : null;
  },
});

export const listTeamMembers = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const users = await ctx.db.query("users").collect();
    return users
      .map((user) => publicUser(user))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
});

export const setUserRole = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    userId: v.id("users"),
    role: adminRoleValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);

    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new Error("User not found");
    }

    await assertNotRemovingLastAdmin(ctx, target, args.role);
    await ctx.db.patch(args.userId, { role: args.role });
    const { writeAuditLog } = await import("./lib/audit");
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "user.role_changed",
      entityType: "users",
      entityId: args.userId,
      summary: `Changed role for ${target.email} to ${args.role}`,
      metadata: { previous: target.role, next: args.role },
    });
    return { success: true as const };
  },
});

export const setUserActive = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    userId: v.id("users"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx, args.sessionToken);
    if (actor._id === args.userId && !args.active) {
      throw new Error("You cannot deactivate your own account");
    }

    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new Error("User not found");
    }

    if (target.role === "admin" && !args.active) {
      const adminCount = await countAdmins(ctx);
      if (adminCount <= 1) {
        throw new Error("Cannot deactivate the last admin");
      }
    }

    await ctx.db.patch(args.userId, {
      active: args.active,
      disabledAt: args.active ? undefined : Date.now(),
    });

    if (!args.active) {
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
      for (const session of sessions) {
        await ctx.db.delete(session._id);
      }
    }

    const { writeAuditLog } = await import("./lib/audit");
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: args.active ? "user.activated" : "user.deactivated",
      entityType: "users",
      entityId: args.userId,
      summary: `${args.active ? "Activated" : "Deactivated"} ${target.email}`,
    });

    return { success: true as const };
  },
});

export const updateProfile = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.sessionToken, [
      "admin",
      "content",
      "registration",
      "accommodation",
    ]);
    const name = args.name.trim();
    if (!name) {
      throw new Error("Name is required");
    }
    await ctx.db.patch(user._id, { name });
    return { success: true as const };
  },
});

export const updatePasswordHash = internalMutation({
  args: {
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { passwordHash: args.passwordHash });
  },
});

export const getAuthUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const logout = mutation({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { success: true as const };
  },
});

export const getAuthUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const getSessionUser = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.sessionToken);
    return user ? publicUser(user) : null;
  },
});

export const countUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.length;
  },
});

export const createUserRecord = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: adminRoleValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      throw new Error("Email already registered");
    }

    return await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      passwordHash: args.passwordHash,
      role: args.role,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const createSessionRecord = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sessions", {
      userId: args.userId,
      token: args.token,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

export const deleteUserSessions = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
  },
});
