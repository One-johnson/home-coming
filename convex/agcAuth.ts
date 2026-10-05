"use node";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  canonicalUsername as canonicalUsernameLib,
  usernameCandidates,
} from "./lib/hubUsername";
import { buildPortalUrl, buildResetUrl } from "./lib/resetUrls";
import {
  emailThrottleKey,
  LOCK_MESSAGE,
  MAX_FAILURES,
} from "./lib/loginThrottle";

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_TTL_MS = 1000 * 60 * 60 * 3; // 3 hours (SRS §7)

/**
 * Canonical username for throttle keys and lookups. The shared rules live
 * in convex/lib/hubUsername.ts: accents folded and every run of
 * non-alphanumeric characters collapsed to one underscore, so typed forms
 * like "Gabon–Libreville" and stored "gabon_libreville" both normalize to
 * the same key.
 */
const canonicalUsername = canonicalUsernameLib;

/**
 * Find a rep by any candidate form of the typed username. The canonical
 * form (last candidate) wins immediately: every punctuation-heavy stored
 * username — like "gabon_-_libreville" from a hub name such as
 * "Gabon – Libreville" — canonicalizes to the same key as anything the
 * rep types, so the exact stored form does not need to match first.
 */
async function findRepByUsername(
  ctx: ActionCtx,
  rawUsername: string,
): Promise<Doc<"agcRepresentatives"> | null> {
  const candidates = usernameCandidates(rawUsername);
  if (candidates.length === 0) return null;
  return await ctx.runQuery(internal.agcAuthData.getRepByUsernameVariants, {
    usernames: candidates,
    canonical: canonicalUsername(rawUsername),
  });
}

/** Structured error payload so the UI can show remaining attempts / lock time. */
export type LoginErrorData = {
  message: string;
  kind: "invalid_credentials" | "locked" | "disabled" | "generic";
  attemptsRemaining?: number;
  lockedUntil?: number;
};

/** Throw a lockout error carrying the unlock timestamp for the UI countdown. */
function throwLocked(lockedUntil: number): never {
  throw new ConvexError<LoginErrorData>({
    message: LOCK_MESSAGE,
    kind: "locked",
    lockedUntil,
  });
}

/** Throw an invalid-credentials error carrying how many attempts are left. */
function throwInvalidCredentials(attemptsRemaining: number): never {
  throw new ConvexError<LoginErrorData>({
    message: "Invalid username or password",
    kind: "invalid_credentials",
    attemptsRemaining,
  });
}

function createSessionToken() {
  return createHash("sha256").update(randomBytes(48)).digest("hex");
}

/**
 * Issue a fresh session for a representative (single active session:
 * existing ones are deleted first). Shared by repLogin and the
 * first-time setup action so setup can sign the rep in directly.
 */
async function issueRepSession(
  ctx: ActionCtx,
  repId: Id<"agcRepresentatives">,
): Promise<{ sessionToken: string; expiresAt: number }> {
  await ctx.runMutation(internal.agcAuthData.deleteRepSessions, { repId });
  const token = createSessionToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await ctx.runMutation(internal.agcAuthData.insertRepSession, {
    repId,
    token,
    expiresAt,
  });
  return { sessionToken: token, expiresAt };
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

/**
 * Login outcome. "setup_required" is an expected state, not an error — the
 * client switches to the first-time setup screen instead of showing an error.
 */
export type RepLoginResult =
  | { kind: "ok"; result: RepAuthResult }
  | { kind: "setup_required" };

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
    const rep = await findRepByUsername(ctx, args.username);

    // Always report success so the endpoint cannot enumerate valid usernames.
    if (!rep || !rep.email || rep.status === "disabled") return { success: true };

    // Anti mail-bombing: both rep-facing email endpoints share one
    // per-mailbox bucket. Suppression is silent — no distinguishable error.
    const allowance = await ctx.runMutation(
      internal.agcAuthData.consumeEmailSendAllowance,
      { key: emailThrottleKey(rep.email) },
    );
    if (!allowance.allowed) return { success: true };

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

/**
 * "Forgot username" flow: after the rep submits their registered email
 * address, that exact username is emailed to it. The response is always
 * success so the endpoint cannot enumerate registered emails — the match
 * against the account's own email address IS the verification.
 */
export const requestUsernameReminder = action({
  args: { email: v.string(), clientOrigin: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ success: true }> => {
    const email = args.email.trim().toLowerCase();
    const rep: Doc<"agcRepresentatives"> | null = email
      ? await ctx.runQuery(internal.agcAuthData.getRepByEmail, { email })
      : null;

    if (!rep || rep.status === "disabled" || !rep.email) {
      return { success: true };
    }

    // Shared per-mailbox anti-bombing bucket with the password-reset flow.
    const allowance = await ctx.runMutation(
      internal.agcAuthData.consumeEmailSendAllowance,
      { key: emailThrottleKey(rep.email) },
    );
    if (!allowance.allowed) return { success: true };

    await queueRepEmail(ctx, {
      to: rep.email,
      subject: "Homecoming 2026 — your representative username",
      body: [
        "Hello,",
        "",
        "You asked us to remind you of the username for your Homecoming 2026 representative portal account.",
        "",
        `Username: ${rep.username}`,
        `Sign in at: ${buildPortalUrl(args.clientOrigin)}`,
        "",
        "Tip: separators are flexible at sign-in — you can type your hub name with underscores, hyphens or spaces.",
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
      throw new ConvexError("Password must be at least 8 characters");
    }
    const reset: Doc<"agcPasswordResets"> | null = await ctx.runQuery(
      internal.agcAuthData.getPasswordReset,
      { token: args.token },
    );
    if (!reset || reset.usedAt || reset.expiresAt < Date.now()) {
      throw new ConvexError("This reset link is invalid or has expired");
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
  handler: async (ctx, args): Promise<RepLoginResult> => {
    const username = canonicalUsername(args.username);
    const rep = await findRepByUsername(ctx, args.username);
    if (!rep) throwInvalidCredentials(MAX_FAILURES);
    if (rep.status === "disabled") {
      throw new ConvexError<LoginErrorData>({
        message: "This account has been disabled. Contact the registration desk.",
        kind: "disabled",
      });
    }

    // Brute-force lockout: reject before hashing/bcrypt if this username
    // is currently locked (protects the shared temp-password window).
    const lock = await ctx.runQuery(internal.agcAuthData.checkLoginLock, {
      username,
    });
    if (lock) throwLocked(lock);

    const ok = await bcrypt.compare(args.password, rep.passwordHash);
    if (!ok) {
      // Record the failure; flip to a lockout message once the cap is hit.
      const throttle = await ctx.runMutation(
        internal.agcAuthData.recordLoginFailure,
        { username },
      );
      if (throttle.lockedUntil) {
        throwLocked(throttle.lockedUntil);
      }
      throwInvalidCredentials(throttle.attemptsRemaining ?? MAX_FAILURES);
    }

    // Expected flow-control outcome (NOT an error): the rep still has a
    // temporary password and must complete first-time setup. Returning a
    // tagged result keeps the browser console clean and lets the client show
    // a friendly transition instead of an exception.
    if (rep.mustChangePassword) {
      return { kind: "setup_required" };
    }

    // Successful sign-in: clear any stale failure counts for this username.
    await ctx.runMutation(internal.agcAuthData.clearLoginFailures, { username });

    // The account stays "pending_setup" until the representative signs in
    // with the new password they chose during first-time setup.
    if (rep.status !== "active") {
      await ctx.runMutation(internal.agcAuthData.activateRepLogin, {
        repId: rep._id,
      });
    }

    const { sessionToken: token, expiresAt } = await issueRepSession(
      ctx,
      rep._id,
    );

    const hub: Doc<"agcHubs"> | null = await ctx.runQuery(
      internal.agcAuthData.getHubById,
      { hubId: rep.hubId },
    );

    return {
      kind: "ok",
      result: {
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
  handler: async (ctx, args): Promise<RepAuthResult> => {
    if (args.newPassword.length < 8) {
      throw new ConvexError("New password must be at least 8 characters");
    }
    const username = canonicalUsername(args.username);
    const rep = await findRepByUsername(ctx, args.username);
    if (!rep) throwInvalidCredentials(MAX_FAILURES);
    if (rep.status === "disabled") {
      throw new ConvexError<LoginErrorData>({
        message: "This account has been disabled. Contact the registration desk.",
        kind: "disabled",
      });
    }

    // Same throttle namespace as sign-in: hammering the setup form with a
    // wrong temporary password gets locked out too.
    const lock = await ctx.runQuery(internal.agcAuthData.checkLoginLock, {
      username,
    });
    if (lock) throwLocked(lock);

    const ok = await bcrypt.compare(args.temporaryPassword, rep.passwordHash);
    if (!ok) {
      const throttle = await ctx.runMutation(
        internal.agcAuthData.recordLoginFailure,
        { username },
      );
      if (throttle.lockedUntil) {
        throwLocked(throttle.lockedUntil);
      }
      throwInvalidCredentials(throttle.attemptsRemaining ?? MAX_FAILURES);
    }

    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("A valid email address is required");
    }

    const emailTaken: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAuthData.getRepByEmail,
      { email },
    );
    if (emailTaken && emailTaken._id !== rep._id) {
      throw new ConvexError("This email address is already in use");
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

    // The rep is verified and set up — activate immediately (clears the
    // temporary password) and sign them straight in.
    await ctx.runMutation(internal.agcAuthData.activateRepLogin, {
      repId: rep._id,
    });
    await ctx.runMutation(internal.agcAuthData.clearLoginFailures, {
      username,
    });
    const { sessionToken, expiresAt } = await issueRepSession(ctx, rep._id);

    const hub: Doc<"agcHubs"> | null = await ctx.runQuery(
      internal.agcAuthData.getHubById,
      { hubId: rep.hubId },
    );

    return {
      sessionToken,
      expiresAt,
      rep: {
        _id: rep._id,
        username: rep.username,
        hubName: hub?.name ?? rep.username,
        firstName: args.firstName.trim(),
        lastName: args.lastName.trim(),
        email,
        phone: args.phone.trim(),
        country: rep.country ?? null,
      },
    };
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
      throw new ConvexError("Unauthorized");
    }

    if (args.newPassword.length < 8) {
      throw new ConvexError("New password must be at least 8 characters");
    }

    const ok = await bcrypt.compare(args.currentPassword, rep.passwordHash);
    if (!ok) throw new ConvexError("Current password is incorrect");

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
