"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  renderRegistrationEmail,
  renderRepCredentialsEmail,
  renderTourEmail,
} from "../emails/render";
import {
  BANNER_BASE64,
  BANNER_CID,
  BANNER_CONTENT_TYPE,
} from "./lib/bannerImage";
import { assertEmailTransportAllowed } from "./lib/emailSafety";
import { getSmtpSettings } from "./lib/smtpConfig";

const BANNER_SRC = `cid:${BANNER_CID}`;

const confirmationValidator = v.object({
  type: v.union(
    v.literal("registration_confirmation"),
    v.literal("tour_confirmation"),
  ),
  recordId: v.string(),
});

const repCredentialsValidator = v.object({
  hubName: v.string(),
  username: v.string(),
  tempPassword: v.string(),
  isResend: v.boolean(),
  portalUrl: v.string(),
});

/**
 * Deliver one email. The payload arrives fully formed (plain text, plus the
 * props needed for the branded render), so nothing has to be read back from or
 * written to the database — a failure can only be logged in the Convex logs.
 */
export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    repCredentials: v.optional(repCredentialsValidator),
    confirmation: v.optional(confirmationValidator),
  },
  handler: async (ctx, args) => {
    try {
      let text = args.text;
      let html = args.html;

      if (args.repCredentials) {
        const rendered = await renderRepCredentialsEmail({
          bannerUrl: BANNER_SRC,
          hubName: args.repCredentials.hubName,
          username: args.repCredentials.username,
          temporaryPassword: args.repCredentials.tempPassword,
          isResend: args.repCredentials.isResend,
          portalUrl: args.repCredentials.portalUrl,
        });
        text = rendered.text;
        html = rendered.html;
      } else if (args.confirmation) {
        const payload = await ctx.runQuery(
          internal.emailSender.getConfirmationPayload,
          args.confirmation,
        );

        if (payload) {
          // Embed the banner inline via CID so it renders without any public
          // hosting of the image.
          const withBanner = { ...payload, bannerUrl: BANNER_SRC };
          if (withBanner.kind === "registration_confirmation") {
            const rendered = await renderRegistrationEmail(withBanner);
            text = rendered.text;
            html = rendered.html;
          } else {
            const rendered = await renderTourEmail(withBanner);
            text = rendered.text;
            html = rendered.html;
          }
        }
      }

      const smtp = getSmtpSettings();
      // Never let a non-production deployment send through the real mailbox.
      assertEmailTransportAllowed({
        appEnv: process.env.APP_ENV,
        host: smtp.host,
        user: smtp.auth.user,
      });
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.auth,
      });

      await transporter.sendMail({
        from: smtp.from,
        to: args.to,
        subject: args.subject,
        text,
        html: html ?? undefined,
        attachments: html
          ? [
              {
                filename: "homecoming-banner.jpeg",
                content: Buffer.from(BANNER_BASE64, "base64"),
                contentType: BANNER_CONTENT_TYPE,
                cid: BANNER_CID,
              },
            ]
          : undefined,
      });
    } catch (error) {
      console.error("Email send failed", {
        to: args.to,
        subject: args.subject,
        error: error instanceof Error ? error.message : error,
      });
    }
  },
});
