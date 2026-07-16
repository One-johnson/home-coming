"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useSyncExternalStore } from "react";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

function getTimeLeftSnapshot(): string {
  const diff = EVENT.startDate.getTime() - Date.now();
  if (diff <= 0) {
    return "0|0|0|0";
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${days}|${hours}|${minutes}|${seconds}`;
}

function subscribe(onStoreChange: () => void) {
  const interval = setInterval(onStoreChange, 1000);
  return () => clearInterval(interval);
}

type CountdownTimerProps = {
  compact?: boolean;
  className?: string;
};

export function CountdownTimer({
  compact = false,
  className,
}: CountdownTimerProps) {
  const shouldReduceMotion = useReducedMotion();
  const snapshot = useSyncExternalStore(
    subscribe,
    getTimeLeftSnapshot,
    () => "",
  );

  const timeLeft = snapshot
    ? (() => {
        const [days, hours, minutes, seconds] = snapshot.split("|").map(Number);
        return { days, hours, minutes, seconds };
      })()
    : null;

  const units = [
    { label: "Days", value: timeLeft?.days },
    { label: "Hours", value: timeLeft?.hours },
    { label: "Minutes", value: timeLeft?.minutes },
    { label: "Seconds", value: timeLeft?.seconds },
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-2 sm:gap-3",
        className,
      )}
      role="timer"
      aria-label="Countdown to Homecoming 2026"
      aria-live="polite"
    >
      {units.map((unit) => {
        const display =
          unit.value !== undefined
            ? String(unit.value).padStart(2, "0")
            : "00";

        return (
          <div
            key={unit.label}
            className={cn(
              "rounded-xl border border-gold-light/50 bg-[#2a2a2a] text-center shadow-lg",
              compact
                ? "min-w-[5rem] px-3 py-3 sm:min-w-[5.75rem] sm:px-4 sm:py-3.5"
                : "px-4 py-5",
            )}
          >
            {shouldReduceMotion ? (
              <p
                className={cn(
                  "font-display font-bold tabular-nums text-[#faf7f2]",
                  compact
                    ? "text-3xl sm:text-4xl"
                    : "text-4xl md:text-5xl",
                )}
              >
                {display}
              </p>
            ) : (
              <motion.p
                key={`${unit.label}-${display}`}
                className={cn(
                  "font-display font-bold tabular-nums text-[#faf7f2]",
                  compact
                    ? "text-3xl sm:text-4xl"
                    : "text-4xl md:text-5xl",
                )}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {display}
              </motion.p>
            )}
            <p
              className={cn(
                "mt-1 font-body font-bold uppercase tracking-[0.18em] text-[#d4af37]",
                compact
                  ? "text-[0.7rem] sm:text-xs"
                  : "mt-2 text-xs tracking-[0.2em]",
              )}
            >
              {unit.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
