import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  TONE_BADGE,
  TONE_DOT,
  TONE_LEGEND,
  TONE_RAIL,
  TONE_SURFACE,
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

/**
 * A count tile with a colour role: used for the desk's action row, cash totals
 * and pre-arrival readiness. `rail` draws the same tone down the left edge so
 * it still reads when a projector washes the tint out.
 */
export function StatTile({
  tone = "neutral",
  label,
  value,
  hint,
  icon: IconComponent,
  className,
}: {
  tone?: StatusTone;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: Icon;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "border-l-4",
        TONE_SURFACE[tone],
        TONE_RAIL[tone],
        className,
      )}
    >
      <CardContent className="p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          {IconComponent ? (
            <IconComponent className={cn("size-3.5 shrink-0", TONE_TEXT[tone])} />
          ) : (
            <ToneDot tone={tone} />
          )}
          <span className="text-muted-foreground">{label}</span>
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
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
