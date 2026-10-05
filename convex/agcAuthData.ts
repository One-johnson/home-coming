import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { writeAuditLog } from "./lib/audit";
import { canonicalUsername } from "./lib/hubUsername";
import { isSmtpConfigured } from "./lib/smtpConfig";
import {
  EMAIL_LOCK_MS,
  EMAIL_MAX_SENDS,
  EMAIL_WINDOW_MS,
  LOCK_MS,
  MAX_FAILURES,
  throttleKey,
  WINDOW_MS,
} from "./lib/loginThrottle";

// ------------------------------------------------------------------
// Internal queries/mutations for the rep auth actions in agcAuth.ts.
// Lives outside the "use node" file: only actions may run in Node.
// ------------------------------------------------------------------

export const getRepByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    // Soft-deleted reps must not authenticate or collide with new accounts.
    const rep = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (!rep || rep.deletedAt !== undefined) return null;
    return rep;
  },
});

/**
 * Lookup a rep by any candidate form of their username. Reps type their
 * hub name freely — "Ashanti-Mampong", "ashanti mampong", "Gabon –
 * Libreville"… — and all forms resolve to the stored username. Candidates
 * are tried in order (exact form first) unless the caller passes the
 * canonical form, which then matches every live rep whose stored username
 * or rename alias canonicalizes to it — so legacy usernames carrying
 * punctuation (e.g. "gabon_-_libreville") still sign in.
 */
export const getRepByUsernameVariants = internalQuery({
  args: {
    usernames: v.array(v.string()),
    canonical: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.canonical) {
      const reps = await ctx.db.query("agcRepresentatives").collect();
      for (const rep of reps) {
        if (rep.deletedAt !== undefined) continue;
        if (
          canonicalUsername(rep.username) === args.canonical ||
          rep.previousUsernames?.some(
            (alias) => canonicalUsername(alias) === args.canonical,
          )
        ) {
          return rep;
        }
      }
      return null;
    }

    for (const username of args.usernames) {
      const rep = await ctx.db
        .query("agcRepresentatives")
        .withIndex("by_username", (q) => q.eq("username", username))
        .unique();
      if (rep && rep.deletedAt === undefined) return rep;
    }
    if (args.usernames.length > 0) {
      const wanted = new Set(args.usernames);
      const reps = await ctx.db.query("agcRepresentatives").collect();
      for (const rep of reps) {
        if (rep.deletedAt !== undefined) continue;
        if (rep.previousUsernames?.some((u) => wanted.has(u))) return rep;
      }
    }
    return null;
  },
});

/**
 * Collision check for create/rename: the username must not belong to any
 * other live rep — neither as their current username nor as a rename alias.
 */
export const findRepByUsernameOrAlias = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const direct = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
    if (direct && direct.deletedAt === undefined) return direct;
    const reps = await ctx.db.query("agcRepresentatives").collect();
    return (
      reps.find(
        (rep) =>
          rep.deletedAt === undefined &&
          rep.previousUsernames?.includes(args.username),
      ) ?? null
    );
  },
});

export const getRepByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // Soft-deleted reps' emails stay reserved until the record is purged.
    const rep = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!rep || rep.deletedAt !== undefined) return null;
    return rep;
  },
});

// ------------------------------------------------------------------
// Login throttle (brute-force lockout for rep sign-in and first-time
// setup, keyed by normalized username).
// ------------------------------------------------------------------

/** Returns the lock expiry while locked, otherwise null. */
export const checkLoginLock = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agcLoginThrottle")
      .withIndex("by_key", (q) => q.eq("key", throttleKey(args.username)))
      .unique();
    if (!row) return null;
    if (row.lockedUntil && row.lockedUntil > Date.now()) {
      return row.lockedUntil;
    }
    return null;
  },
});

export const recordLoginFailure = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const key = throttleKey(args.username);
    const now = Date.now();

    // Lazy cleanup keeps the table small: drop stale rows on every touch.
    const stale = await ctx.db
      .query("agcLoginThrottle")
      .withIndex("by_key")
      .collect();
    for (const row of stale) {
      const expired =
        row.lockedUntil !== undefined && row.lockedUntil < now;
      const windowOver =
        row.lastFailureAt !== undefined &&
        now - row.lastFailureAt > WINDOW_MS &&
        (row.lockedUntil === undefined || row.lockedUntil < now);
      if (expired || windowOver) {
        await ctx.db.delete(row._id);
      }
    }

    const row = await ctx.db
      .query("agcLoginThrottle")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    if (!row) {
      await ctx.db.insert("agcLoginThrottle", {
        key,
        failedCount: 1,
        lastFailureAt: now,
      });
      return { lockedUntil: undefined, attemptsRemaining: MAX_FAILURES - 1 };
    }

    // A failure after a previous lock expired restarts the count.
    if (
      row.lockedUntil !== undefined &&
      row.lockedUntil <= now &&
      now - (row.lastFailureAt ?? 0) > WINDOW_MS
    ) {
      await ctx.db.patch(row._id, {
        failedCount: 1,
        lockedUntil: undefined,
        lastFailureAt: now,
      });
      return { lockedUntil: undefined, attemptsRemaining: MAX_FAILURES - 1 };
    }

    const failedCount = row.failedCount + 1;
    if (failedCount >= MAX_FAILURES) {
      const lockedUntil = now + LOCK_MS;
      await ctx.db.patch(row._id, { failedCount, lockedUntil, lastFailureAt: now });
      return { lockedUntil, attemptsRemaining: 0 };
    }

    await ctx.db.patch(row._id, { failedCount, lastFailureAt: now });
    return { lockedUntil: undefined, attemptsRemaining: MAX_FAILURES - failedCount };
  },
});

export const clearLoginFailures = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("agcLoginThrottle")
      .withIndex("by_key", (q) => q.eq("key", throttleKey(args.username)))
      .unique();
    if (row) {
      await ctx.db.delete(row._id);
    }
  },
});

/**
 * Atomically consume one email-send allowance for a mailbox bucket.
 * Returns allowed=false once EMAIL_MAX_SENDS sends have happened within
 * EMAIL_WINDOW_MS — the caller must then silently skip the email (never
 * reveal suppression, or the endpoint becomes enumerable again). The
 * check-and-record happens in one mutation so concurrent requests cannot
 * race past the cap.
 */
export const consumeEmailSendAllowance = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args): Promise<{ allowed: boolean }> => {
    const now = Date.now();
    const row = await ctx.db
      .query("agcLoginThrottle")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (row) {
      // Suppressed: the mailbox is locked or the cap was just exceeded.
      if (
        (row.lockedUntil !== undefined && row.lockedUntil > now) ||
        row.failedCount >= EMAIL_MAX_SENDS
      ) {
        if (row.lockedUntil === undefined || row.lockedUntil < now) {
          await ctx.db.patch(row._id, {
            failedCount: row.failedCount + 1,
            lockedUntil: now + EMAIL_LOCK_MS,
            lastFailureAt: now,
          });
        }
        return { allowed: false };
      }
      // Window over → start a fresh allowance period.
      if (
        row.lastFailureAt !== undefined &&
        now - row.lastFailureAt > EMAIL_WINDOW_MS
      ) {
        await ctx.db.patch(row._id, {
          failedCount: 1,
          lockedUntil: undefined,
          lastFailureAt: now,
        });
        return { allowed: true };
      }
      await ctx.db.patch(row._id, {
        failedCount: row.failedCount + 1,
        lastFailureAt: now,
      });
      return { allowed: true };
    }

    await ctx.db.insert("agcLoginThrottle", {
      key: args.key,
      failedCount: 1,
      lastFailureAt: now,
    });
    return { allowed: true };
  },
});

export const getHubById = internalQuery({
  args: { hubId: v.id("agcHubs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.hubId);
  },
});

export const getRepBySession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("agcRepSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;
    const rep = await ctx.db.get(session.repId);
    if (!rep || rep.deletedAt !== undefined) return null;
    return rep;
  },
});

export const getPasswordReset = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agcPasswordResets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
  },
});

export const insertRepSession = internalMutation({
  args: {
    repId: v.id("agcRepresentatives"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agcRepSessions", {
      repId: args.repId,
      token: args.token,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

export const deleteRepSessions = internalMutation({
  args: { repId: v.id("agcRepresentatives") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("agcRepSessions")
      .withIndex("by_rep", (q) => q.eq("repId", args.repId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
  },
});

export const insertPasswordReset = internalMutation({
  args: {
    repId: v.id("agcRepresentatives"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Invalidate any previous unused tokens for this rep.
    const existing = await ctx.db
      .query("agcPasswordResets")
      .withIndex("by_rep", (q) => q.eq("repId", args.repId))
      .collect();
    for (const reset of existing) {
      if (!reset.usedAt) {
        await ctx.db.delete(reset._id);
      }
    }
    await ctx.db.insert("agcPasswordResets", {
      repId: args.repId,
      token: args.token,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

export const completePasswordReset = internalMutation({
  args: {
    resetId: v.id("agcPasswordResets"),
    repId: v.id("agcRepresentatives"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repId, {
      passwordHash: args.passwordHash,
      mustChangePassword: false,
      status: "active",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.resetId, { usedAt: Date.now() });
    const sessions = await ctx.db
      .query("agcRepSessions")
      .withIndex("by_rep", (q) => q.eq("repId", args.repId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
  },
});

export const activateRepLogin = internalMutation({
  args: { repId: v.id("agcRepresentatives") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repId, {
      status: "active",
      // The rep has their own password now — the temporary one is no longer
      // valid and must not appear in exports.
      tempPassword: undefined,
      updatedAt: Date.now(),
    });
  },
});

export const completeRepSetup = internalMutation({
  args: {
    repId: v.id("agcRepresentatives"),
    passwordHash: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repId, {
      passwordHash: args.passwordHash,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      profileComplete: true,
      mustChangePassword: false,
      // Status stays "pending_setup" — the account activates on the first
      // successful login with the new password (activateRepLogin).
      updatedAt: Date.now(),
    });
  },
});

export const updateRepPasswordHash = internalMutation({
  args: {
    repId: v.id("agcRepresentatives"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.repId, {
      passwordHash: args.passwordHash,
      updatedAt: Date.now(),
    });
  },
});

export const insertAuditEntry = internalMutation({
  args: {
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await writeAuditLog(ctx, {
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      summary: args.summary,
    });
  },
});

export const insertEmailLog = internalMutation({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    const emailLogId: Id<"emailLogs"> = await ctx.db.insert("emailLogs", {
      to: args.to,
      subject: args.subject,
      body: args.body,
      type: "agc_rep_notification",
      status,
      createdAt: Date.now(),
    });
    return { emailLogId, shouldSend: status === "pending" };
  },
});

// ------------------------------------------------------------------
// Rep credentials emails (account created / credentials resent)
// ------------------------------------------------------------------

/**
 * Queue the "your username + temporary password" email for a representative.
 * Rendered to branded HTML by emailSendAction when SMTP is configured;
 * otherwise logged with status "stub" so the content is still auditable.
 * Safe to call for reps without an email on file — the call is a no-op.
 */
export const queueRepCredentialsEmail = internalMutation({
  args: {
    repId: v.id("agcRepresentatives"),
    hubName: v.string(),
    username: v.string(),
    tempPassword: v.string(),
    isResend: v.boolean(),
    portalUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const rep = await ctx.db.get(args.repId);
    if (!rep?.email) return { emailLogId: null, shouldSend: false };

    const subject = args.isResend
      ? "Homecoming 2026 — new sign-in details for your representative account"
      : "Homecoming 2026 — your representative account details";
    const body = [
      `Hello ${args.hubName} representative,`,
      "",
      args.isResend
        ? "A new temporary password was issued for your representative account. Your previous password no longer works."
        : "An account has been created for your hub on the Homecoming representative portal.",
      "",
      `Portal: ${args.portalUrl}`,
      `Username: ${args.username}`,
      `Temporary password: ${args.tempPassword}`,
      "",
      "Sign in with these details, choose a new password and complete your profile — your account activates right away.",
      "",
      "Please treat the temporary password as confidential until you have replaced it with your own.",
      "",
      "— Homecoming 2026 Registration Desk",
    ].join("\n");

    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    const emailLogId: Id<"emailLogs"> = await ctx.db.insert("emailLogs", {
      to: rep.email,
      subject,
      body,
      type: "agc_rep_notification",
      status,
      createdAt: Date.now(),
    });

    // Stash the pieces needed for the branded HTML render.
    await ctx.db.patch(emailLogId, {
      referenceId: JSON.stringify({
        hubName: args.hubName,
        username: args.username,
        tempPassword: args.tempPassword,
        isResend: args.isResend,
        portalUrl: args.portalUrl,
      }),
    });

    return { emailLogId, shouldSend: status === "pending" };
  },
});
