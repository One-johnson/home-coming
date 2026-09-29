"use client";

import { cn } from "@/lib/utils";

/**
 * Shared stat tile for the rep portal — one cohesive look for every summary
 * number (Overview top row, registration totals, per-room-type counts,
 * availability tiles).
 *
 * A tone tints the icon chip and the value so statuses read at a glance:
 * neutral (default), positive (paid/confirmed), warning (awaiting payment),
 * danger (closing deadlines), or info (holds/in-review).
 */

export type StatTone = "neutral" | "positive" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<StatTone, { chip: string; value: string }> = {
  neutral: {
    chip: "bg-gold/15 text-gold-dark",
    value: "text-ink",
  },
  positive: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  warning: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-400",
  },
  danger: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
    value: "text-rose-700 dark:text-rose-400",
  },
  info: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
    value: "text-sky-700 dark:text-sky-400",
  },
};

export function StatTile({
  icon: Icon,
  label,
  valueSuffix,
  value,
  hint,
  tone = "neutral",
  size = "md",
  className,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  /** Small caption on the same line as the value, e.g. "of 40 beds". */
  valueSuffix?: string;
  value: string | number;
  hint?: string;
  tone?: StatTone;
  /** md = page-level tiles, sm = sub-tiles inside a card. */
  size?: "sm" | "md";
  className?: string;
  /** Optional footer row (links, badges, extra detail lines). */
  children?: React.ReactNode;
}) {
  const classes = TONE_CLASSES[tone];
  const large = size === "md";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10",
        large ? "p-4" : "p-3",
        className,
      )}
    >
      <p
        className={cn(
          "flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground",
          large ? "text-xs" : "text-[11px]",
        )}
      >
        {Icon && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-md",
              classes.chip,
              large ? "size-5" : "size-4",
            )}
          >
            <Icon className={large ? "size-3" : "size-2.5"} aria-hidden />
          </span>
        )}
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          "mt-1 font-semibold tabular-nums",
          large ? "text-2xl" : "text-lg",
          classes.value,
        )}
      >
        {value}
        {valueSuffix && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {valueSuffix}
          </span>
        )}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
