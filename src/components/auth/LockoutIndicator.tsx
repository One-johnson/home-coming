"use client";

import { useEffect, useState } from "react";
import { ShieldAlertIcon } from "lucide-react";

export const MAX_LOGIN_ATTEMPTS = 5;

/**
 * Lockout progress for sign-in forms: dots for remaining attempts, or a live
 * countdown while the lock is active. State comes from the structured
 * payloads the auth actions throw (see friendlyError.loginErrorInfo).
 */
export function LockoutIndicator({
  attemptsRemaining,
  lockedUntil,
  label = "attempts remaining before a 15-minute lock",
}: {
  attemptsRemaining: number | null;
  lockedUntil: number | null;
  /** Sentence fragment; "N " is prepended, "Last attempt" replaces the number at 1. */
  label?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  if (lockedUntil !== null) {
    const msLeft = Math.max(0, lockedUntil - now);
    if (msLeft <= 0) return null;
    const minutes = Math.floor(msLeft / 60_000);
    const seconds = Math.floor((msLeft % 60_000) / 1000);
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
      >
        <ShieldAlertIcon className="size-4 shrink-0" />
        <span>
          Too many attempts — locked for{" "}
          <strong className="tabular-nums">
            {minutes}:{String(seconds).padStart(2, "0")}
          </strong>
          . Try again after the countdown.
        </span>
      </div>
    );
  }

  if (attemptsRemaining === null) return null;
  const attemptsUsed = Math.min(
    MAX_LOGIN_ATTEMPTS,
    Math.max(0, MAX_LOGIN_ATTEMPTS - attemptsRemaining),
  );
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950"
    >
      <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
        {attemptsRemaining === 1
          ? "Last attempt before a 15-minute lock"
          : `${attemptsRemaining} ${label}`}
      </p>
      <div className="mt-1.5 flex gap-1" aria-hidden="true">
        {Array.from({ length: MAX_LOGIN_ATTEMPTS }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < attemptsUsed
                ? "bg-destructive/70"
                : "bg-amber-300 dark:bg-amber-800"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
