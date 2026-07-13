import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./users";

export const listEmailLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"]);
    return await ctx.db.query("emailLogs").collect();
  },
});

export const sendStubEmail = mutation({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    type: v.string(),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
  args: { id: v.id("emailLogs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "sent" });
  },
});
