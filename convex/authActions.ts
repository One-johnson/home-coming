"use node";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  SESSION_TTL_MS,
  adminRoleValidator,
  sessionTokenValidator,
  type AdminRole,
} from "./users";
import { buildResetUrl } from "./lib/resetUrls";
import { LOCK_MESSAGE } from "./lib/loginThrottle";

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 1000 * 60 * 60 * 3; // 3 hours (mirrors rep reset window)

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createSessionToken() {
  return createHash("sha256").update(randomBytes(48)).digest("hex");
}

/** Structured error payload for admin sign-in (mirrors agcAuth's shape). */
export type AdminLoginErrorData = {
  message: string;
  kind: "invalid_credentials" | "locked" | "deactivated" | "generic";
  attemptsRemaining?: number;
  lockedUntil?: number;
};

/** Thrown while an admin email is locked out; carries the unlock time. */
function throwAdminLocked(lockedUntil: number): never {
  throw new ConvexError<AdminLoginErrorData>({
    message: LOCK_MESSAGE,
    kind: "locked",
    lockedUntil,
  });
}

/** Thrown on wrong admin credentials; carries the remaining attempt budget. */
function throwAdminInvalidCredentials(attemptsRemaining: number): never {
  throw new ConvexError<AdminLoginErrorData>({
    message: "Invalid email or password",
    kind: "invalid_credentials",
    attemptsRemaining,
  });
}

type AuthResult = {
  sessionToken: string;
  expiresAt: number;
  user: {
    _id: Id<"users">;
    name: string;
    email: string;
    role: AdminRole;
  };
};

export const registerInitialAdmin = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args): Promise<AuthResult> => {
    const userCount: number = await ctx.runQuery(internal.users.countUsers, {});
    if (userCount > 0) {
      throw new ConvexError(
        "Admin registration is closed. Ask an existing admin to create your account.",
      );
    }

    if (args.password.length < 8) {
      throw new ConvexError("Password must be at least 8 characters");
    }

    const email = normalizeEmail(args.email);
    const name = args.name.trim();
    if (!name || !email) {
      throw new ConvexError("Name and email are required");
    }

    const passwordHash = await bcrypt.hash(args.password, BCRYPT_ROUNDS);
    const userId: Id<"users"> = await ctx.runMutation(
      internal.users.createUserRecord,
      {
        name,
        email,
        passwordHash,
        role: "admin",
      },
    );

    const token = createSessionToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.runMutation(internal.users.createSessionRecord, {
      userId,
      token,
      expiresAt,
    });

    return {
      sessionToken: token,
      expiresAt,
      user: {
        _id: userId,
        name,
        email,
        role: "admin",
      },
    };
  },
});

/**
 * Register an admin/staff account by redeeming an invite code issued from
 * the Team page. Keeps /admin/register open for new accounts without ever
 * allowing anonymous self-registration: every code is single-use, expiring,
 * revocable, and optionally locked to one email address.
 */
export const registerWithInvite = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    inviteCode: v.string(),
  },
  handler: async (ctx, args): Promise<AuthResult> => {
    if (args.password.length < 8) {
      throw new ConvexError("Password must be at least 8 characters");
    }

    const email = normalizeEmail(args.email);
    const name = args.name.trim();
    const code = args.inviteCode.trim().toLowerCase();
    if (!name || !email || !code) {
      throw new ConvexError("Name, email and registration code are required");
    }

    const invite = await ctx.runQuery(
      internal.adminInvites.validateInviteInternal,
      { code },
    );
    if (!invite.valid) {
      throw new ConvexError(invite.reason);
    }

    // Email lock: the code may be restricted to a single address.
    if (invite.email && invite.email !== email) {
      throw new ConvexError(
        "This registration code is locked to a different email address",
      );
    }

    // Fail fast on duplicate accounts before consuming the invite.
    const existingUser: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getAuthUserByEmail,
      { email },
    );
    if (existingUser) {
      throw new ConvexError("Email already registered");
    }

    const passwordHash = await bcrypt.hash(args.password, BCRYPT_ROUNDS);
    const userId: Id<"users"> = await ctx.runMutation(
      internal.users.createUserRecord,
      {
        name,
        email,
        passwordHash,
        role: invite.role,
      },
    );

    await ctx.runMutation(internal.adminInvites.consumeInviteInternal, {
      inviteId: invite.inviteId,
      userId,
    });

    const token = createSessionToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.runMutation(internal.users.createSessionRecord, {
      userId,
      token,
      expiresAt,
    });

    return {
      sessionToken: token,
      expiresAt,
      user: {
        _id: userId,
        name,
        email,
        role: invite.role,
      },
    };
  },
});

export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args): Promise<AuthResult> => {
    const email = normalizeEmail(args.email);

    // Brute-force lockout, mirroring rep sign-in (shared throttle table,
    // "admin:"-namespaced keys so admin emails never collide with usernames).
    const lock: number | null = await ctx.runQuery(
      internal.users.checkAdminLock,
      { email },
    );
    if (lock) throwAdminLocked(lock);

    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getAuthUserByEmail,
      { email },
    );

    if (!user) {
      const throttle = await ctx.runMutation(
        internal.users.recordAdminFailure,
        { email },
      );
      if (throttle.lockedUntil) throwAdminLocked(throttle.lockedUntil);
      throwAdminInvalidCredentials(throttle.attemptsRemaining);
    }

    if (user.active === false) {
      throw new ConvexError<AdminLoginErrorData>({
        message: "This account has been deactivated",
        kind: "deactivated",
      });
    }

    const ok = await bcrypt.compare(args.password, user.passwordHash);
    if (!ok) {
      const throttle = await ctx.runMutation(
        internal.users.recordAdminFailure,
        { email },
      );
      if (throttle.lockedUntil) throwAdminLocked(throttle.lockedUntil);
      throwAdminInvalidCredentials(throttle.attemptsRemaining);
    }

    // Successful sign-in clears the failure budget.
    await ctx.runMutation(internal.users.clearAdminFailures, { email });

    await ctx.runMutation(internal.users.deleteUserSessions, {
      userId: user._id,
    });

    const token = createSessionToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.runMutation(internal.users.createSessionRecord, {
      userId: user._id,
      token,
      expiresAt,
    });

    return {
      sessionToken: token,
      expiresAt,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },
});

export const adminCreateUser = action({
  args: {
    sessionToken: sessionTokenValidator,
    name: v.string(),
    email: v.string(),
    password: v.string(),
    role: adminRoleValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    _id: Id<"users">;
    name: string;
    email: string;
    role: AdminRole;
  }> => {
    const actor = await ctx.runQuery(internal.users.getSessionUser, {
      sessionToken: args.sessionToken,
    });
    if (!actor || actor.role !== "admin") {
      throw new ConvexError("Unauthorized");
    }

    if (args.password.length < 8) {
      throw new ConvexError("Password must be at least 8 characters");
    }

    const email = normalizeEmail(args.email);
    const name = args.name.trim();
    if (!name || !email) {
      throw new ConvexError("Name and email are required");
    }

    const passwordHash = await bcrypt.hash(args.password, BCRYPT_ROUNDS);
    const userId: Id<"users"> = await ctx.runMutation(
      internal.users.createUserRecord,
      {
        name,
        email,
        passwordHash,
        role: args.role,
      },
    );

    return {
      _id: userId,
      name,
      email,
      role: args.role,
    };
  },
});

export const requestAdminPasswordReset = action({
  args: { email: v.string(), clientOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ success: true }> => {
    const email = normalizeEmail(args.email);
    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getAuthUserByEmail,
      { email },
    );

    // Always report success so the endpoint cannot enumerate valid emails.
    if (!user || user.active === false) return { success: true };

    const token = createHash("sha256").update(randomBytes(32)).digest("hex");
    await ctx.runMutation(internal.adminAuthData.insertAdminPasswordReset, {
      userId: user._id,
      token,
      expiresAt: Date.now() + RESET_TTL_MS,
    });

    const url = buildResetUrl(
      args.clientOrigin,
      "/admin/reset-password",
      token,
    );
    const result = await ctx.runMutation(internal.adminAuthData.insertEmailLog, {
      to: user.email,
      subject: "Homecoming admin — password reset",
      body: [
        "Hello,",
        "",
        "A password reset was requested for your Homecoming admin console account.",
        `Open this link within 3 hours to choose a new password: ${url}`,
        "",
        "If you did not request this, you can ignore this email and your password will remain unchanged.",
        "",
        "— Homecoming Admin",
      ].join("\n"),
    });
    if (result.shouldSend) {
      await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
        emailLogId: result.emailLogId,
      });
    }
    return { success: true };
  },
});

export const resetAdminPassword = action({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    if (args.newPassword.length < 8) {
      throw new ConvexError("Password must be at least 8 characters");
    }
    const reset: Doc<"adminPasswordResets"> | null = await ctx.runQuery(
      internal.adminAuthData.getAdminPasswordReset,
      { token: args.token },
    );
    if (!reset || reset.usedAt || reset.expiresAt < Date.now()) {
      throw new ConvexError("This reset link is invalid or has expired");
    }

    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getAuthUserById,
      { userId: reset.userId },
    );
    if (!user || user.active === false) {
      throw new ConvexError("This reset link is invalid or has expired");
    }

    const passwordHash = await bcrypt.hash(args.newPassword, BCRYPT_ROUNDS);
    await ctx.runMutation(internal.adminAuthData.completeAdminPasswordReset, {
      resetId: reset._id,
      userId: reset.userId,
      passwordHash,
    });
    return { success: true };
  },
});

export const changePassword = action({
  args: {
    sessionToken: sessionTokenValidator,
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: true }> => {
    const actor = await ctx.runQuery(internal.users.getSessionUser, {
      sessionToken: args.sessionToken,
    });
    if (!actor) {
      throw new ConvexError("Unauthorized");
    }

    if (args.newPassword.length < 8) {
      throw new ConvexError("New password must be at least 8 characters");
    }

    const fullUser: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getAuthUserById,
      { userId: actor._id },
    );
    if (!fullUser) {
      throw new ConvexError("User not found");
    }

    const ok = await bcrypt.compare(
      args.currentPassword,
      fullUser.passwordHash,
    );
    if (!ok) {
      throw new ConvexError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(args.newPassword, BCRYPT_ROUNDS);
    await ctx.runMutation(internal.users.updatePasswordHash, {
      userId: fullUser._id,
      passwordHash,
    });

    // Rotate sessions for security after password change
    await ctx.runMutation(internal.users.deleteUserSessions, {
      userId: fullUser._id,
    });

    return { success: true };
  },
});
