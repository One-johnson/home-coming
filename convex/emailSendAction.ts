"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  renderAccommodationEmail,
  renderRegistrationEmail,
  renderTourEmail,
} from "../emails/render";
import {
  BANNER_BASE64,
  BANNER_CID,
  BANNER_CONTENT_TYPE,
} from "./lib/bannerImage";
import { getSmtpSettings } from "./lib/smtpConfig";

const BANNER_SRC = `cid:${BANNER_CID}`;

export const sendEmail = internalAction({
  args: { emailLogId: v.id("emailLogs") },
  handler: async (ctx, args) => {
    const log = await ctx.runQuery(internal.emailSender.getEmailLog, {
      id: args.emailLogId,
    });
    if (!log || log.status !== "pending") return;

    try {
      let text = log.body;
      let html = log.htmlBody;

      if (
        log.referenceId &&
        (log.type === "registration_confirmation" ||
          log.type === "accommodation_confirmation" ||
          log.type === "tour_confirmation")
      ) {
        const payload = await ctx.runQuery(
          internal.emailSender.getConfirmationPayload,
          {
            type: log.type,
            recordId: log.referenceId,
          },
        );

        if (payload) {
          // Embed the banner inline via CID so it renders without any public
          // hosting of the image.
          const withBanner = { ...payload, bannerUrl: BANNER_SRC };
          if (withBanner.kind === "registration_confirmation") {
            const rendered = await renderRegistrationEmail(withBanner);
            text = rendered.text;
            html = rendered.html;
          } else if (withBanner.kind === "accommodation_confirmation") {
            const rendered = await renderAccommodationEmail(withBanner);
            text = rendered.text;
            html = rendered.html;
          } else {
            const rendered = await renderTourEmail(withBanner);
            text = rendered.text;
            html = rendered.html;
          }

          await ctx.runMutation(internal.emailSender.storeRenderedEmail, {
            id: args.emailLogId,
            body: text,
            htmlBody: html,
          });
        }
      }

      const smtp = getSmtpSettings();
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.auth,
      });

      await transporter.sendMail({
        from: smtp.from,
        to: log.to,
        subject: log.subject,
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

      await ctx.runMutation(internal.emailSender.markEmailResult, {
        id: args.emailLogId,
        status: "sent",
      });
    } catch (error) {
      await ctx.runMutation(internal.emailSender.markEmailResult, {
        id: args.emailLogId,
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Failed to send email",
      });
    }
  },
});
