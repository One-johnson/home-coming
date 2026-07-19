import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  buildConfirmationEmailPayload,
  plainTextFromPayload,
} from "./lib/emailTemplates";
import type { ConfirmationEmailType } from "./lib/paymentEmail";
import { isSmtpConfigured } from "./lib/smtpConfig";

const confirmationTypeValidator = v.union(
  v.literal("registration_confirmation"),
  v.literal("accommodation_confirmation"),
  v.literal("tour_confirmation"),
);

export const getEmailLog = internalQuery({
  args: { id: v.id("emailLogs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getConfirmationPayload = internalQuery({
  args: {
    type: confirmationTypeValidator,
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    return await buildConfirmationEmailPayload(
      ctx,
      args.type as ConfirmationEmailType,
      args.recordId,
    );
  },
});

export const markEmailResult = internalMutation({
  args: {
    id: v.id("emailLogs"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      errorMessage: args.errorMessage,
    });
  },
});

export const storeRenderedEmail = internalMutation({
  args: {
    id: v.id("emailLogs"),
    body: v.string(),
    htmlBody: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      body: args.body,
      htmlBody: args.htmlBody,
    });
  },
});

export const queueConfirmationEmail = internalMutation({
  args: {
    type: confirmationTypeValidator,
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailLogs")
      .withIndex("by_type_reference", (q) =>
        q.eq("type", args.type).eq("referenceId", args.recordId),
      )
      .collect();

    const alreadyHandled = existing.some(
      (log) => log.status === "sent" || log.status === "pending",
    );
    if (alreadyHandled) return null;

    const payload = await buildConfirmationEmailPayload(
      ctx,
      args.type as ConfirmationEmailType,
      args.recordId,
    );
    if (!payload) return null;

    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    const emailLogId = await ctx.db.insert("emailLogs", {
      to: payload.to,
      subject: payload.subject,
      body: plainTextFromPayload(payload),
      type: args.type,
      referenceId: args.recordId,
      status,
      createdAt: Date.now(),
    });

    if (status === "pending") {
      await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
        emailLogId,
      });
    }

    return emailLogId;
  },
});

export const queueResendEmail = internalMutation({
  args: { emailLogId: v.id("emailLogs") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.emailLogId);
    if (!existing) throw new Error("Email log not found");

    const status = isSmtpConfigured() ? ("pending" as const) : ("stub" as const);
    await ctx.db.patch(args.emailLogId, {
      status,
      errorMessage: undefined,
    });

    if (status === "pending") {
      await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
        emailLogId: args.emailLogId,
      });
    }
  },
});
