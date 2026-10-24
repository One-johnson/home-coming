import type { ReactNode } from "react";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

/**
 * Frame for every signed-out rep screen (sign in, first-time setup, username
 * reminder, password reset). Centres the card in the viewport on both axes and
 * carries the event's identity above it, so a rep who lands on a bare
 * /portal URL knows they are in the right place before typing anything.
 */
export function RepAuthShell({
  children,
  size = "md",
}: {
  children: ReactNode;
  /** Setup collects a profile, so its card is wider than a plain sign in. */
  size?: "md" | "lg";
}) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-y-auto bg-neutral-100 px-4 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,rgba(212,175,55,0.20),transparent_58%)]"
      />
      <div
        className={cn(
          "relative m-auto w-full py-8",
          size === "lg" ? "max-w-lg" : "max-w-md",
        )}
      >
        <header className="mb-6 flex flex-col items-center text-center">
          <div
            aria-hidden
            className="flex size-12 items-center justify-center rounded-2xl bg-gold/15 font-display text-lg font-bold text-gold-dark ring-1 ring-gold/30"
          >
            H
          </div>
          <p className="mt-3 font-display text-xl text-ink">{EVENT.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Representative portal
          </p>
        </header>

        {children}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {EVENT.dates} · {EVENT.venue}, {EVENT.location}
        </p>
      </div>
    </div>
  );
}
