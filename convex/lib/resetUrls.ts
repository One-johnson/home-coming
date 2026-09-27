/**
 * Builds absolute reset-password URLs for emails.
 *
 * The frontend passes the requesting browser's origin so dev servers on
 * drifted ports (e.g. localhost:5401) produce working links. The origin is
 * validated server-side to prevent phishing links in reset emails:
 * - localhost/127.0.0.1 (any port) is always allowed for development;
 * - any other host must match the configured SITE_URL / NEXT_PUBLIC_SITE_URL.
 * When absent or rejected, fall back to the configured site URL.
 */

function envSiteUrl() {
  return (
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000"
  );
}

export function isAllowedResetOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.pathname !== "" && url.pathname !== "/") return false;
    if (url.search || url.hash || url.username || url.password) return false;

    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    ) {
      return true;
    }
    try {
      const configured = new URL(envSiteUrl());
      return configured.hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function buildResetUrl(
  requestedOrigin: string | undefined,
  path: string,
  token: string,
): string {
  const base = (
    isAllowedResetOrigin(requestedOrigin) ? requestedOrigin! : envSiteUrl()
  ).replace(/\/$/, "");
  return `${base}${path}?token=${token}`;
}

/** Absolute /portal URL using the same origin validation as reset links. */
export function buildPortalUrl(requestedOrigin: string | undefined): string {
  const base = (
    isAllowedResetOrigin(requestedOrigin) ? requestedOrigin! : envSiteUrl()
  ).replace(/\/$/, "");
  return `${base}/portal`;
}
