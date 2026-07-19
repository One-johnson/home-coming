import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { writeAuditLog } from "./lib/audit";
import { requireRole, sessionTokenValidator } from "./users";

export const listEmailLogs = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    return await ctx.db
      .query("emailLogs")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

export const getEmailLogById = query({
  args: { sessionToken: sessionTokenValidator, id: v.id("emailLogs") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    return await ctx.db.get(args.id);
  },
});

export const sendStubEmail = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    type: v.string(),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    return await ctx.db.insert("emailLogs", {
      to: args.to,
      subject: args.subject,
      body: args.body,
      type: args.type,
      referenceId: args.referenceId,
      status: "stub",
      createdAt: Date.now(),
    });
  },
});

export const markEmailSent = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("emailLogs") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin"]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Email log not found");
    await ctx.db.patch(args.id, { status: "sent", errorMessage: undefined });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "email.marked_sent",
      entityType: "emailLogs",
      entityId: args.id,
      summary: `Marked email to ${existing.to} as sent`,
    });
  },
});

export const markEmailFailed = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("emailLogs") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin"]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Email log not found");
    await ctx.db.patch(args.id, { status: "failed" });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "email.marked_failed",
      entityType: "emailLogs",
      entityId: args.id,
      summary: `Marked email to ${existing.to} as failed`,
    });
  },
});

export const resendEmail = mutation({
  args: { sessionToken: sessionTokenValidator, id: v.id("emailLogs") },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin"]);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Email log not found");

    await ctx.scheduler.runAfter(0, internal.emailSender.queueResendEmail, {
      emailLogId: args.id,
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "email.resent",
      entityType: "emailLogs",
      entityId: args.id,
      summary: `Queued resend to ${existing.to}`,
    });
  },
});
