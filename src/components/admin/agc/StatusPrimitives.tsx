import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TONE_BADGE,
  TONE_DOT,
  TONE_LEGEND,
  TONE_TEXT,
  type StatusTone,
} from "@/lib/agcStatusTone";

/**
 * The shared status primitives. Every arrival-day screen renders state through
 * these, so a colour means the same thing on the desk, in the runbook and in
 * the exports.
 */

type Icon = ComponentType<{ className?: string }>;

export function StatusBadge({
  tone,
  icon: IconComponent,
  children,
  className,
  title,
}: {
  tone: StatusTone;
  icon?: Icon;
  children: ReactNode;
  className?: string;
  /** Hover text for the "why" behind a state, e.g. what a badge needs. */
  title?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn("gap-1 whitespace-nowrap", TONE_BADGE[tone], className)}
    >
      {IconComponent ? <IconComponent className="size-3 shrink-0" /> : null}
      {children}
    </Badge>
  );
}

export function ToneDot({
  tone,
  className,
}: {
  tone: StatusTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", TONE_DOT[tone], className)}
    />
  );
}

/** A document legend: colour + word + what it means. */
export function StatusLegend({
  tones,
  className,
}: {
  tones?: StatusTone[];
  className?: string;
}) {
  const entries = tones
    ? TONE_LEGEND.filter((entry) => tones.includes(entry.tone))
    : TONE_LEGEND;
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {entries.map((entry) => (
        <li key={entry.tone} className="flex items-center gap-1.5">
          <ToneDot tone={entry.tone} />
          <span className={cn("font-medium", TONE_TEXT[entry.tone])}>
            {entry.label}
          </span>
          <span>— {entry.hint}</span>
        </li>
      ))}
    </ul>
  );
}

/** Icon chip tint per tone (the tile itself stays a plain card). */
const TONE_CHIP: Record<StatusTone, string> = {
  done: "bg-emerald-100 text-emerald-700",
  blocked: "bg-amber-100 text-amber-800",
  refused: "bg-rose-100 text-rose-700",
  waiting: "bg-slate-100 text-slate-600",
  info: "bg-sky-100 text-sky-700",
  neutral: "bg-gold/15 text-gold-dark",
};

/**
 * A count tile with a colour role — the console's one stat tile look (same as
 * the rep portal's): a plain card, a tinted icon chip, a tinted number. Pass
 * `onClick` to make it a filter shortcut; `active` marks the applied filter.
 */
export function StatTile({
  tone = "neutral",
  label,
  value,
  hint,
  icon: IconComponent,
  onClick,
  active = false,
  className,
}: {
  tone?: StatusTone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: Icon;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md",
            TONE_CHIP[tone],
          )}
        >
          {IconComponent ? (
            <IconComponent className="size-3" />
          ) : (
            <ToneDot tone={tone} className="size-1.5" />
          )}
        </span>
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "neutral" ? "text-foreground" : TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs leading-tight text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </>
  );
  const frame = cn(
    "flex min-w-0 flex-col rounded-xl bg-card p-3.5 text-left shadow-soft ring-1 ring-foreground/10 transition-all duration-300",
    active && "ring-2 ring-gold",
    className,
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          frame,
          "outline-none hover:-translate-y-0.5 hover:shadow-elevate hover:ring-gold/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={frame}>{body}</div>;
}
