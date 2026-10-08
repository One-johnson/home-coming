/**
 * Deployment-safety guard for outgoing email.
 *
 * Every deployment sets `APP_ENV` (`production` on prod, `dev` on the dev
 * deployment). Email must only leave the sandbox through the production
 * mailbox on the production deployment — dev/staging flows go through
 * sandbox SMTP (Ethereal) so real members can never receive dev mail.
 *
 * Kept pure (no Convex imports) so it can be unit-tested directly.
 */

/** The real production mailbox. Never configure these on a non-prod deployment. */
export const PROD_SMTP_HOST = "mail.homecomingconvention.com";
export const PROD_SMTP_USER = "info@homecomingconvention.com";

/** Normalized APP_ENV. A missing/unset APP_ENV is treated as non-production. */
export function appEnvName(env: { APP_ENV?: string | undefined }): string {
  const value = (env.APP_ENV ?? "").trim().toLowerCase();
  return value || "development";
}

/** Whether the given SMTP credentials are the production mailbox. */
export function isProdMailbox(host: string, user: string): boolean {
  return (
    host.trim().toLowerCase() === PROD_SMTP_HOST &&
    user.trim().toLowerCase() === PROD_SMTP_USER
  );
}

/**
 * Throws when a non-production deployment is about to send through the
 * production mailbox. Call immediately before `transporter.sendMail`.
 */
export function assertEmailTransportAllowed(input: {
  appEnv?: string | undefined;
  host: string;
  user: string;
}): void {
  const appEnv = appEnvName({ APP_ENV: input.appEnv });
  if (appEnv === "production") return;
  if (isProdMailbox(input.host, input.user)) {
    throw new Error(
      `Email blocked: production SMTP credentials are configured on a non-production deployment (APP_ENV="${appEnv}"). ` +
        "Set sandbox SMTP credentials (e.g. smtp.ethereal.email) on this deployment before sending email.",
    );
  }
}
