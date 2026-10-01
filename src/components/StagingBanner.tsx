import { FlaskConical } from "lucide-react";

/**
 * True when the app was built for the staging environment:
 * - staging sets NEXT_PUBLIC_SITE_URL to https://staging.homecomingconvention.com
 *   (see STAGING.md §3.3); production uses the apex domain.
 * - Any *.{vercel.app} preview build is also staging-like: it is never prod.
 * - Local dev (no SITE_URL at all) is not flagged.
 */
export function isStagingDeployment(): boolean {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (siteUrl.startsWith("https://staging.")) return true;
  if (/\.vercel\.app/.test(siteUrl)) return true;
  // Vercel injects VERCEL_ENV into every build: "production" on the prod
  // domain, "preview" everywhere else. Anything that is not a real
  // production build gets the banner too.
  return process.env.VERCEL_ENV === "preview";
}

/** Fixed ribbon so staging and production are impossible to confuse. */
export function StagingBanner() {
  if (!isStagingDeployment()) return null;

  return (
    <div
      role="status"
      aria-label="Staging environment notice"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex justify-center pb-2 md:bottom-2"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100/95 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-900 shadow-md backdrop-blur print:hidden">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden />
        Staging — test data only
      </div>
    </div>
  );
}
