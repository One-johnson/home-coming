import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  buildConfirmationEmailPayload,
  plainTextFromPayload,
} from "./lib/emailTemplates";
import type { ConfirmationEmailType } from "./lib/paymentEmail";
import { isSmtpConfigured } from "./lib/smtpConfig";

const confirmationTypeValidator = v.union(
  v.literal("registration_confirmation"),
  v.literal("tour_confirmation"),
);

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

/**
 * Queue the confirmation email for a paid registration or tour. Nothing is
 * persisted: the recipient and the record travel straight to the Node action
 * that renders the branded email and hands it to SMTP.
 */
export const queueConfirmationEmail = internalMutation({
  args: {
    type: confirmationTypeValidator,
    recordId: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isSmtpConfigured()) return null;

    const payload = await buildConfirmationEmailPayload(
      ctx,
      args.type as ConfirmationEmailType,
      args.recordId,
    );
    if (!payload) return null;

    await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
      to: payload.to,
      subject: payload.subject,
      text: plainTextFromPayload(payload),
      confirmation: { type: args.type, recordId: args.recordId },
    });

    return payload.to;
  },
});
