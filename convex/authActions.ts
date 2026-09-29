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

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 1000 * 60 * 60 * 3; // 3 hours (mirrors rep reset window)

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createSessionToken() {
  return createHash("sha256").update(randomBytes(48)).digest("hex");
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

export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args): Promise<AuthResult> => {
    const email = normalizeEmail(args.email);
    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.users.getAuthUserByEmail,
      { email },
    );

    if (!user) {
      throw new ConvexError("Invalid email or password");
    }

    if (user.active === false) {
      throw new ConvexError("This account has been deactivated");
    }

    const ok = await bcrypt.compare(args.password, user.passwordHash);
    if (!ok) {
      throw new ConvexError("Invalid email or password");
    }

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
