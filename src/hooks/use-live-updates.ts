"use client";

import { useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * Whether a screen should keep its live subscriptions open. Every open
 * subscription re-runs (and is billed) on each write to what it read, so a
 * desk tab left in the background, or a laptop nobody has touched in a while,
 * pays for every check-in at every other desk. This turns false once the tab
 * has been hidden for `hiddenGraceMs`, or nobody has used the page for
 * `idleMs`, and back to true the moment the tab is shown or used again.
 */
export function useLiveUpdates({
  hiddenGraceMs = 60_000,
  idleMs = 10 * 60_000,
}: { hiddenGraceMs?: number; idleMs?: number } = {}): boolean {
  const [hiddenLong, setHiddenLong] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivity = useRef(0);

  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      if (document.visibilityState === "hidden") {
        hiddenTimer = setTimeout(() => setHiddenLong(true), hiddenGraceMs);
      } else {
        setHiddenLong(false);
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [hiddenGraceMs]);

  useEffect(() => {
    const arm = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIdle(true), idleMs);
    };
    const onActivity = () => {
      // pointermove fires constantly; re-arming once a second is plenty.
      const now = Date.now();
      if (now - lastActivity.current < 1_000) return;
      lastActivity.current = now;
      setIdle(false);
      arm();
    };
    arm();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [idleMs]);

  return !hiddenLong && !idle;
}

/**
 * Holds the last loaded value for `key` while a subscription is skipped, so a
 * paused screen keeps showing its data instead of dropping to a skeleton. A
 * new key (another building, another filter) never shows the old key's data.
 */
export function useLastValue<T>(value: T | undefined, key: string): T | undefined {
  const [last, setLast] = useState<{ key: string; value: T } | null>(null);
  // Adjusting state while rendering: React re-renders before painting.
  if (value !== undefined && (last?.key !== key || last.value !== value)) {
    setLast({ key, value });
  }
  if (value !== undefined) return value;
  return last?.key === key ? last.value : undefined;
}
