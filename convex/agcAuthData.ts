import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { writeAuditLog } from "./lib/audit";
import { isSmtpConfigured } from "./lib/smtpConfig";

// ------------------------------------------------------------------
// Internal queries/mutations for the rep auth actions in agcAuth.ts.
// Lives outside the "use node" file: only actions may run in Node.
// ------------------------------------------------------------------

export const getRepByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

export const getRepByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
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
    return await ctx.db.get(session.repId);
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
