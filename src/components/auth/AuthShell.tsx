import type { ReactNode } from "react";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

/**
 * Shared frame for every signed-out surface — rep portal and staff sign-ins
 * alike. Centres the card in the viewport on both axes, carries the event's
 * identity above it and the dates/venue below, and paints a soft gold wash
 * behind the card so the page reads as part of the event rather than a bare
 * form on a grey background.
 *
 * Centring uses auto margins rather than `justify-center` on purpose: when the
 * child is taller than the viewport (first-time setup on a phone) auto margins
 * collapse to zero and the content scrolls from its top instead of having the
 * heading clipped off-screen.
 */
export function AuthShell({
  brand,
  monogram,
  eyebrow,
  size = "md",
  footer,
  children,
}: {
  /** Event/conference name shown under the monogram. */
  brand: string;
  /** Short mark for the badge, e.g. "AGC". */
  monogram: string;
  /** Context line: "Representative portal", "Admin console", "Finance team". */
  eyebrow: string;
  /** Wider card for screens that collect a profile. */
  size?: "md" | "lg";
  /** Optional line under the card (links, support address). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-y-auto bg-neutral-100 px-4 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(212,175,55,0.20),transparent_58%)]"
      />
      <div
        className={cn(
          "relative m-auto w-full py-6 sm:py-8",
          size === "lg" ? "max-w-lg" : "max-w-md",
        )}
      >
        <header className="mb-6 flex flex-col items-center text-center">
          <div
            aria-hidden
            className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-gold/15 px-3 font-display text-lg font-bold text-gold-dark ring-1 ring-gold/30"
          >
            {monogram}
          </div>
          <p className="mt-3 font-display text-xl text-ink">{brand}</p>
          <p className="mt-0.5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        </header>

        {children}
        {footer}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {EVENT.dates} · {EVENT.venue}, {EVENT.location}
        </p>
      </div>
    </div>
  );
}
