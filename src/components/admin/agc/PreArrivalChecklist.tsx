"use client";

import { useQuery } from "convex/react";
import {
  CalendarDays,
  CircleAlert,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Printer,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatTile,
  StatusBadge,
  StatusLegend,
} from "@/components/admin/agc/StatusPrimitives";
import {
  TONE_BADGE,
  TONE_BAR,
  TONE_RAIL,
  TONE_SURFACE,
  TONE_TEXT,
  type StatusTone,
} from "@/lib/agcStatusTone";
import { cn } from "@/lib/utils";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";

const TYPE_LABEL = (type: string) =>
  AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;

type Status = "ok" | "warn" | "error";

const STATUS_TONE: Record<Status, StatusTone> = {
  ok: "done",
  warn: "blocked",
  error: "refused",
};

const STATUS_META: Record<
  Status,
  { icon: typeof CircleCheck; label: string }
> = {
  ok: { icon: CircleCheck, label: "Ready" },
  warn: { icon: CircleAlert, label: "Check" },
  error: { icon: CircleX, label: "Blocking" },
};

export function PreArrivalChecklist() {
  const { sessionToken } = useAdminSession();
  const readiness = useQuery(
    api.agcPreArrival.getReadiness,
    sessionToken ? { sessionToken } : "skip",
  );

  if (!readiness) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const counts: Record<Status, number> = { ok: 0, warn: 0, error: 0 };
  for (const item of readiness.items) counts[item.status] += 1;
  const overallTone: StatusTone =
    counts.error > 0 ? "refused" : counts.warn > 0 ? "blocked" : "done";
  const OverallIcon =
    overallTone === "refused"
      ? CircleX
      : overallTone === "blocked"
        ? CircleAlert
        : CircleCheck;
  const headline =
    overallTone === "done"
      ? "Ready for arrival — every check passed."
      : overallTone === "blocked"
        ? `${counts.warn} check(s) need attention before the door opens.`
        : `${counts.error} blocking issue(s) — arrival cannot run on this setup.`;

  return (
    <div className="space-y-4 print:space-y-2">
      <Card
        className={cn(
          "border-l-4 print:break-inside-avoid",
          TONE_SURFACE[overallTone],
          TONE_RAIL[overallTone],
        )}
      >
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full border",
              TONE_BADGE[overallTone],
            )}
          >
            <OverallIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("font-medium", TONE_TEXT[overallTone])}>{headline}</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {readiness.arrivalPassed
                ? "Arrival day is here — November 2, 2026"
                : `${readiness.daysUntilArrival} day(s) to November 2, 2026`}
              <span aria-hidden>·</span>
              {counts.ok}/{readiness.items.length} checks ready
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone="done" icon={CircleCheck}>
              {counts.ok} ready
            </StatusBadge>
            <StatusBadge tone="blocked" icon={CircleAlert}>
              {counts.warn} to check
            </StatusBadge>
            <StatusBadge tone="refused" icon={CircleX}>
              {counts.error} blocking
            </StatusBadge>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 print:hidden"
            href="/admin/reports"
          >
            <Printer className="size-3.5" /> Ops reports
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Rooms imported"
          value={readiness.perType.reduce((sum, t) => sum + t.importedRooms, 0)}
          tone="info"
          hint={`${readiness.perType.reduce((sum, t) => sum + t.published, 0)} published to hub reps`}
        />
        <StatTile
          label="Beds imported"
          value={readiness.perType.reduce((sum, t) => sum + t.importedCapacity, 0)}
          tone="info"
          hint={`${readiness.perType.reduce((sum, t) => sum + t.poolTotal, 0)} confirmed in the inventory pools`}
        />
        <StatTile
          label="Delegates assigned"
          value={readiness.perType.reduce((sum, t) => sum + t.assigned, 0)}
          tone={
            readiness.perType.some(
              (t) => t.importedCapacity > 0 && t.assigned >= t.importedCapacity,
            )
              ? "blocked"
              : "done"
          }
          hint="Beds currently held"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-1">
        {readiness.items.map((item) => {
          const tone = STATUS_TONE[item.status];
          const meta = STATUS_META[item.status];
          const Icon = meta.icon;
          return (
            <Card
              key={item.key}
              className={cn(
                "border-l-4 print:break-inside-avoid",
                TONE_SURFACE[tone],
                TONE_RAIL[tone],
              )}
            >
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md border",
                        TONE_BADGE[tone],
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    {item.label}
                  </p>
                  <StatusBadge tone={tone} icon={Icon} className="text-[10px] uppercase tracking-wide">
                    {meta.label}
                  </StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
                {item.link && item.linkLabel ? (
                  <Button
                    size="sm"
                    variant="outline"
                    href={item.link}
                    className="h-7 text-xs print:hidden"
                  >
                    {item.linkLabel}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="print:break-inside-avoid">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ClipboardCheck className="size-3.5" /> Inventory by accommodation
              type (imported vs. confirmed pool)
            </p>
            <StatusLegend tones={["done", "blocked"]} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Pool</th>
                  <th className="pb-2">Imported</th>
                  <th className="pb-2">Rooms</th>
                  <th className="pb-2">Published</th>
                  <th className="pb-2">Assigned</th>
                  <th className="pb-2 w-40">Imported vs pool</th>
                </tr>
              </thead>
              <tbody>
                {readiness.perType.map((t) => {
                  const under = t.poolTotal > 0 && t.importedCapacity < t.poolTotal;
                  const over = t.poolTotal > 0 && t.importedCapacity > t.poolTotal;
                  const tone: StatusTone = over
                    ? "refused"
                    : under
                      ? "blocked"
                      : "done";
                  const percent =
                    t.poolTotal > 0
                      ? Math.min(100, Math.round((t.importedCapacity / t.poolTotal) * 100))
                      : 0;
                  return (
                    <tr key={t.accommodationType} className="border-t">
                      <td className="py-2 font-medium">{TYPE_LABEL(t.accommodationType)}</td>
                      <td className="py-2 tabular-nums">{t.poolTotal}</td>
                      <td className={cn("py-2 tabular-nums font-medium", TONE_TEXT[tone])}>
                        {t.importedCapacity}
                        {t.poolTotal > 0 ? (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            ({percent}%)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 tabular-nums">{t.importedRooms}</td>
                      <td className="py-2 tabular-nums">{t.published}</td>
                      <td className="py-2 tabular-nums">{t.assigned}</td>
                      <td className="py-2">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", TONE_BAR[tone])}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        {under ? (
                          <p className={cn("mt-1 text-[10px]", TONE_TEXT.blocked)}>
                            {t.poolTotal - t.importedCapacity} bed(s) short
                          </p>
                        ) : over ? (
                          <p className={cn("mt-1 text-[10px]", TONE_TEXT.refused)}>
                            {t.importedCapacity - t.poolTotal} bed(s) over the pool
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!readiness.overallOk && (
        <p className="text-xs text-muted-foreground">
          Fix the items above in the linked screens, then reload here. Amber items
          are recoverable on the day; rose items block the desk.
        </p>
      )}
    </div>
  );
}
