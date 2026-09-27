import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { writeAuditLog } from "./lib/audit";
import { isSmtpConfigured } from "./lib/smtpConfig";

// ------------------------------------------------------------------
// Internal queries/mutations for the admin password-reset actions in
// authActions.ts. Lives outside the "use node" file: only actions may
// run in Node (convex guidelines.md).
// ------------------------------------------------------------------

export const getAdminPasswordReset = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("adminPasswordResets")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
  },
});

export const insertAdminPasswordReset = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Invalidate any previous unused tokens for this user.
    const existing = await ctx.db
      .query("adminPasswordResets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const reset of existing) {
      if (!reset.usedAt) {
        await ctx.db.delete(reset._id);
      }
    }
    await ctx.db.insert("adminPasswordResets", {
      userId: args.userId,
      token: args.token,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
  },
});

export const completeAdminPasswordReset = internalMutation({
  args: {
    resetId: v.id("adminPasswordResets"),
    userId: v.id("users"),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { passwordHash: args.passwordHash });
    await ctx.db.patch(args.resetId, { usedAt: Date.now() });
    // Rotate sessions: every signed-in device must re-authenticate.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    await writeAuditLog(ctx, {
      action: "admin.password_reset_completed",
      entityType: "users",
      entityId: args.userId,
      summary: "Admin completed a password reset via emailed link",
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
      type: "admin_notification",
      status,
      createdAt: Date.now(),
    });
    return { emailLogId, shouldSend: status === "pending" };
  },
});
