"use client";

import { useQuery } from "convex/react";
import {
  CalendarDays,
  CircleCheck,
  CircleAlert,
  CircleX,
  ClipboardCheck,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";

const TYPE_LABEL = (type: string) =>
  AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;

type Status = "ok" | "warn" | "error";

const STATUS_STYLES: Record<
  Status,
  { icon: typeof CircleCheck; badge: string; text: string }
> = {
  ok: {
    icon: CircleCheck,
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  warn: {
    icon: CircleAlert,
    badge: "border-amber-300 bg-amber-50 text-amber-800",
    text: "text-amber-800 dark:text-amber-400",
  },
  error: {
    icon: CircleX,
    badge: "border-red-300 bg-red-50 text-red-700",
    text: "text-red-700 dark:text-red-400",
  },
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

  const okCount = readiness.items.filter((i) => i.status === "ok").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          className="gap-1.5"
        >
          <CalendarDays className="size-3.5" />
          {readiness.arrivalPassed
            ? "Arrival day is here — November 2, 2026"
            : `${readiness.daysUntilArrival} day(s) to November 2, 2026`}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            readiness.overallOk
              ? STATUS_STYLES.ok.badge
              : STATUS_STYLES.warn.badge,
          )}
        >
          {okCount}/{readiness.items.length} checks ready
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {readiness.items.map((item) => {
          const style = STATUS_STYLES[item.status];
          const Icon = style.icon;
          return (
            <Card key={item.key}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    <Icon className={cn("size-4 shrink-0", style.text)} />
                    {item.label}
                  </p>
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      style.text,
                    )}
                  >
                    {item.status === "ok"
                      ? "Ready"
                      : item.status === "warn"
                        ? "Check"
                        : "Blocking"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
                {item.link && item.linkLabel ? (
                  <Button
                    size="sm"
                    variant="outline"
                    href={item.link}
                    className="h-7 text-xs"
                  >
                    {item.linkLabel}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ClipboardCheck className="size-3.5" /> Inventory by accommodation
            type (imported vs. confirmed pool)
          </p>
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
                </tr>
              </thead>
              <tbody>
                {readiness.perType.map((t) => {
                  const under = t.poolTotal > 0 && t.importedCapacity < t.poolTotal;
                  return (
                    <tr key={t.accommodationType} className="border-t">
                      <td className="py-2 font-medium">{TYPE_LABEL(t.accommodationType)}</td>
                      <td className="py-2 tabular-nums">{t.poolTotal}</td>
                      <td className={cn("py-2 tabular-nums", under && "text-amber-700 dark:text-amber-400")}>
                        {t.importedCapacity}
                      </td>
                      <td className="py-2 tabular-nums">{t.importedRooms}</td>
                      <td className="py-2 tabular-nums">{t.published}</td>
                      <td className="py-2 tabular-nums">{t.assigned}</td>
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
          Fix the items above in the linked screens, then reload here.
        </p>
      )}
    </div>
  );
}
