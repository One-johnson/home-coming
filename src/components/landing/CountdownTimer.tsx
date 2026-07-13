"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useSyncExternalStore } from "react";
import { EVENT } from "@/lib/eventConfig";

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

export function CountdownTimer() {
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
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      role="timer"
      aria-label="Countdown to Homecoming Convention"
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
            className="rounded-xl border border-gold-light/60 bg-[#0a0a0a]/75 px-4 py-5 text-center shadow-lg backdrop-blur-md"
          >
            {shouldReduceMotion ? (
              <p className="font-display text-4xl font-normal tabular-nums text-[#faf7f2] md:text-5xl">
                {display}
              </p>
            ) : (
              <motion.p
                key={`${unit.label}-${display}`}
                className="font-display text-4xl font-normal tabular-nums text-[#faf7f2] md:text-5xl"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                {display}
              </motion.p>
            )}
            <p className="mt-2 font-body text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
              {unit.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
