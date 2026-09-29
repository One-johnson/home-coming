"use client";

import { useEffect, useState } from "react";
import { ClockAlertIcon } from "lucide-react";

const DAY_MS = 86_400_000;

/** Read (and key) the persisted dismissal, SSR-safely. */
function readDismissed(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("homecoming_expiry_banner_dismissed");
  } catch {
    // Storage unavailable — just always show.
    return null;
  }
}

/**
 * Warning shown when the signed-in session ends within `warnBeforeMs`
 * (default: the final day of its 30-day lifetime). Persisted dismissals
 * expire together with the session, so the banner re-appears if the user
 * signs in again for a fresh session.
 */
export function SessionExpiryBanner({
  expiresAt,
  warnBeforeMs = DAY_MS,
  onSignOut,
}: {
  /** Epoch ms when the session ends; the banner hides when unknown. */
  expiresAt: number | null;
  warnBeforeMs?: number;
  onSignOut: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  // Lazy initializer runs after hydration on the client; dismissals are keyed
  // to this session's expiry so a fresh sign-in re-shows the banner.
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (expiresAt === null) return null;
  const msLeft = expiresAt - now;
  if (msLeft > warnBeforeMs || msLeft <= 0) return null;

  const dismissKey = String(expiresAt);
  if (dismissed === dismissKey) return null;

  const hours = Math.max(1, Math.ceil(msLeft / 3_600_000));
  const dismiss = () => {
    setDismissed(dismissKey);
    try {
      window.localStorage.setItem("homecoming_expiry_banner_dismissed", dismissKey);
    } catch {
      // Non-critical.
    }
  };

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <ClockAlertIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          Your session ends in{" "}
          <strong className="tabular-nums">
            {hours} hour{hours === 1 ? "" : "s"}
          </strong>
          . Sign out and back in at your convenience to start a fresh 30 days.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-md border border-amber-400 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          Sign out now
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
