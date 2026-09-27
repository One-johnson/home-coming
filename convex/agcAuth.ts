"use node";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { isSmtpConfigured } from "./lib/smtpConfig";
import { buildResetUrl } from "./lib/resetUrls";

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_TTL_MS = 1000 * 60 * 60 * 3; // 3 hours (SRS §7)

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function createSessionToken() {
  return createHash("sha256").update(randomBytes(48)).digest("hex");
}

export type RepAuthResult = {
  sessionToken: string;
  expiresAt: number;
  rep: {
    _id: string;
    username: string;
    hubName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
  };
};

async function queueRepEmail(
  ctx: ActionCtx,
  args: { to: string; subject: string; body: string },
) {
  const result = await ctx.runMutation(internal.agcAuthData.insertEmailLog, args);
  if (result.shouldSend) {
    await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
      emailLogId: result.emailLogId,
    });
  }
}

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------

export const requestPasswordReset = action({
  args: { username: v.string(), clientOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ success: true }> => {
    const username = normalizeUsername(args.username);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAuthData.getRepByUsername,
      { username },
    );

    // Always report success so the endpoint cannot enumerate valid usernames.
    if (!rep || !rep.email || rep.status === "disabled") return { success: true };

    const token = createHash("sha256").update(randomBytes(32)).digest("hex");
    await ctx.runMutation(internal.agcAuthData.insertPasswordReset, {
      repId: rep._id,
      token,
      expiresAt: Date.now() + RESET_TTL_MS,
    });
    const url = buildResetUrl(
      args.clientOrigin,
      "/portal/reset-password",
      token,
    );
    await queueRepEmail(ctx, {
      to: rep.email,
      subject: "Homecoming 2026 — representative password reset",
      body: [
        `Hello ${rep.username},`,
        "",
        "A password reset was requested for your AGC 2026 representative portal account.",
        `Open this link within 3 hours to choose a new password: ${url}`,
        "",
        "If you did not request this, you can ignore this email.",
        "",
        "— Homecoming 2026 Registration Desk",
      ].join("\n"),
    });
    return { success: true };
  },
});

export const resetPassword = action({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    if (args.newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const reset: Doc<"agcPasswordResets"> | null = await ctx.runQuery(
      internal.agcAuthData.getPasswordReset,
      { token: args.token },
    );
    if (!reset || reset.usedAt || reset.expiresAt < Date.now()) {
      throw new Error("This reset link is invalid or has expired");
    }

    const passwordHash = await bcrypt.hash(args.newPassword, BCRYPT_ROUNDS);
    await ctx.runMutation(internal.agcAuthData.completePasswordReset, {
      resetId: reset._id,
      repId: reset.repId,
      passwordHash,
    });
    return { success: true };
  },
});

export const repLogin = action({
  args: { username: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<RepAuthResult> => {
    const username = normalizeUsername(args.username);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAuthData.getRepByUsername,
      { username },
    );
    if (!rep) throw new Error("Invalid username or password");
    if (rep.status === "disabled") {
      throw new Error(
        "This account has been disabled. Contact the registration desk.",
      );
    }

    const ok = await bcrypt.compare(args.password, rep.passwordHash);
    if (!ok) throw new Error("Invalid username or password");

    if (rep.mustChangePassword) {
      throw new Error(
        "First-time setup required: set a new password to activate your account.",
      );
    }

    // The account stays "pending_setup" until the representative signs in
    // with the new password they chose during first-time setup.
    if (rep.status !== "active") {
      await ctx.runMutation(internal.agcAuthData.activateRepLogin, {
        repId: rep._id,
      });
    }

    await ctx.runMutation(internal.agcAuthData.deleteRepSessions, { repId: rep._id });
    const token = createSessionToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.runMutation(internal.agcAuthData.insertRepSession, {
      repId: rep._id,
      token,
      expiresAt,
    });

    const hub: Doc<"agcHubs"> | null = await ctx.runQuery(
      internal.agcAuthData.getHubById,
      { hubId: rep.hubId },
    );

    return {
      sessionToken: token,
      expiresAt,
      rep: {
        _id: rep._id,
        username: rep.username,
        hubName: hub?.name ?? rep.username,
        firstName: rep.firstName ?? null,
        lastName: rep.lastName ?? null,
        email: rep.email ?? null,
        phone: rep.phone ?? null,
        country: rep.country ?? null,
      },
    };
  },
});

export const completeFirstLoginSetup = action({
  args: {
    username: v.string(),
    temporaryPassword: v.string(),
    newPassword: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: true }> => {
    if (args.newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }
    const username = normalizeUsername(args.username);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAuthData.getRepByUsername,
      { username },
    );
    if (!rep) throw new Error("Invalid username or password");
    if (rep.status === "disabled") {
      throw new Error(
        "This account has been disabled. Contact the registration desk.",
      );
    }

    const ok = await bcrypt.compare(args.temporaryPassword, rep.passwordHash);
    if (!ok) throw new Error("Invalid username or password");

    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("A valid email address is required");
    }

    const emailTaken: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAuthData.getRepByEmail,
      { email },
    );
    if (emailTaken && emailTaken._id !== rep._id) {
      throw new Error("This email address is already in use");
    }

    const passwordHash = await bcrypt.hash(args.newPassword, BCRYPT_ROUNDS);
    await ctx.runMutation(internal.agcAuthData.completeRepSetup, {
      repId: rep._id,
      passwordHash,
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      email,
      phone: args.phone.trim(),
    });

    await ctx.runMutation(internal.agcAuthData.insertAuditEntry, {
      action: "agc_rep.setup_completed",
      entityType: "agcRepresentatives",
      entityId: rep._id,
      summary: `Representative ${rep.username} completed first-time setup`,
    });

    // No session is issued here: the account remains "pending_setup" until
    // the representative signs in with the new password (see repLogin).
    return { success: true };
  },
});

export const changeRepPassword = action({
  args: {
    sessionToken: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    const rep: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAuthData.getRepBySession,
      { token: args.sessionToken },
    );
    if (!rep || rep.status === "disabled") {
      throw new Error("Unauthorized");
    }

    if (args.newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }

    const ok = await bcrypt.compare(args.currentPassword, rep.passwordHash);
    if (!ok) throw new Error("Current password is incorrect");

    const passwordHash = await bcrypt.hash(args.newPassword, BCRYPT_ROUNDS);
    await ctx.runMutation(internal.agcAuthData.updateRepPasswordHash, {
      repId: rep._id,
      passwordHash,
    });

    // Rotate sessions after a password change (mirrors admin auth).
    await ctx.runMutation(internal.agcAuthData.deleteRepSessions, { repId: rep._id });
    return { success: true };
  },
});
