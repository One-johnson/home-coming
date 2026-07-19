export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim());
}

export function getSmtpSettings() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? "";
  if (!host || !user) {
    throw new Error("SMTP is not configured");
  }

  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure =
    process.env.SMTP_SECURE === "true" || String(port) === "465";

  return {
    host,
    port,
    secure,
    auth: { user, pass },
    from:
      process.env.SMTP_FROM?.trim() ||
      `"Homecoming" <${user}>`,
  };
}
