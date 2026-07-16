"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  BedDouble,
  ClipboardList,
  Info,
  Mail,
  TrendingDown,
  TrendingUp,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OverviewCharts } from "@/components/admin/OverviewCharts";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HOUSING_TONE_CLASS,
  KPI_ACCENTS,
  auditActionBadgeClass,
  housingCapacityTone,
} from "@/lib/adminColors";
import { canAccessArea } from "@/lib/adminRoles";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

function WeekDelta({ thisWeek, lastWeek }: { thisWeek: number; lastWeek: number }) {
  const delta = thisWeek - lastWeek;
  if (delta === 0) {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        Same as last week
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <TrendingUp className="size-3.5" />
        +{delta} vs last week
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700">
      <TrendingDown className="size-3.5" />
      {delta} vs last week
    </span>
  );
}

function AttentionIcon({ tone }: { tone: "warn" | "danger" | "info" }) {
  if (tone === "danger") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
        <AlertTriangle className="size-4" />
      </span>
    );
  }
  if (tone === "warn") {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
        <AlertTriangle className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
      <Info className="size-4" />
    </span>
  );
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "danger" | "info";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-normal tabular-nums",
        tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "danger" && "border-rose-200 bg-rose-50 text-rose-800",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-800",
      )}
    >
      <span className="font-semibold">{value}</span>
      {label}
    </Badge>
  );
}

export default function AdminOverviewPage() {
  const { user, sessionToken } = useAdminSession();
  const role = user?.role;
  const sessionArgs = useSessionArgs();
  const seedData = useMutation(api.seed.seed);
  const overview = useQuery(
    api.admin.getOverview,
    sessionArgs ? sessionArgs : "skip",
  );

  const canRegistration = canAccessArea(role, "registration");
  const canAccommodation = canAccessArea(role, "accommodation");
  const canContent = canAccessArea(role, "content");
  const canEmails = canAccessArea(role, "emails");
  const canSeed = canAccessArea(role, "seed");
  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`Welcome back${firstName ? `, ${firstName}` : ""}. ${EVENT.dates} · ${EVENT.location}`}
        actions={
          <>
            {canRegistration && (
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/admin/registrations" />}
              >
                Registrations
                <ArrowUpRight className="size-4" />
              </Button>
            )}
            {canContent && (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href="/admin/videos" />}
              >
                Videos
              </Button>
            )}
          </>
        }
      />

      {!overview ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {canRegistration && (
              <Link href="/admin/registrations" className="group">
                <Card
                  className={cn(
                    "h-full overflow-hidden bg-gradient-to-br transition-all group-hover:shadow-sm",
                    KPI_ACCENTS.registrations.tint,
                    KPI_ACCENTS.registrations.border,
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Registrations
                    </CardTitle>
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg",
                        KPI_ACCENTS.registrations.icon,
                      )}
                    >
                      <ClipboardList className="size-4" />
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.registrations.total}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip
                        label="paid"
                        value={overview.registrations.paid}
                        tone="ok"
                      />
                      <StatusChip
                        label="pending"
                        value={overview.registrations.pending}
                        tone="warn"
                      />
                      {overview.registrations.failed > 0 && (
                        <StatusChip
                          label="failed"
                          value={overview.registrations.failed}
                          tone="danger"
                        />
                      )}
                    </div>
                    <WeekDelta
                      thisWeek={overview.registrations.thisWeek}
                      lastWeek={overview.registrations.lastWeek}
                    />
                  </CardContent>
                </Card>
              </Link>
            )}
            {canAccommodation && (
              <Link href="/admin/bookings" className="group">
                <Card
                  className={cn(
                    "h-full overflow-hidden bg-gradient-to-br transition-all group-hover:shadow-sm",
                    KPI_ACCENTS.bookings.tint,
                    KPI_ACCENTS.bookings.border,
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Bookings
                    </CardTitle>
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg",
                        KPI_ACCENTS.bookings.icon,
                      )}
                    >
                      <BedDouble className="size-4" />
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.bookings.total}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip
                        label="paid"
                        value={overview.bookings.paid}
                        tone="ok"
                      />
                      <StatusChip
                        label="pending"
                        value={overview.bookings.pending}
                        tone="warn"
                      />
                    </div>
                    <p className="text-xs font-medium text-amber-800">
                      ${overview.bookings.revenue.toLocaleString()} revenue · +
                      {overview.bookings.thisWeek} this week
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {canContent && (
              <Link href="/admin/videos" className="group">
                <Card
                  className={cn(
                    "h-full overflow-hidden bg-gradient-to-br transition-all group-hover:shadow-sm",
                    KPI_ACCENTS.videos.tint,
                    KPI_ACCENTS.videos.border,
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Videos
                    </CardTitle>
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg",
                        KPI_ACCENTS.videos.icon,
                      )}
                    >
                      <Video className="size-4" />
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.content.videos}
                    </p>
                    <StatusChip
                      label="FAQs"
                      value={overview.content.faqs}
                      tone="info"
                    />
                  </CardContent>
                </Card>
              </Link>
            )}
            {canEmails && (
              <Link href="/admin/emails" className="group">
                <Card
                  className={cn(
                    "h-full overflow-hidden bg-gradient-to-br transition-all group-hover:shadow-sm",
                    KPI_ACCENTS.emails.tint,
                    KPI_ACCENTS.emails.border,
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Emails
                    </CardTitle>
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg",
                        KPI_ACCENTS.emails.icon,
                      )}
                    >
                      <Mail className="size-4" />
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.emails.total}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip
                        label="sent"
                        value={overview.emails.sent}
                        tone="info"
                      />
                      <StatusChip
                        label="stub"
                        value={overview.emails.stub}
                        tone="warn"
                      />
                      {overview.emails.failed > 0 && (
                        <StatusChip
                          label="failed"
                          value={overview.emails.failed}
                          tone="danger"
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-rose-400 to-sky-400" />
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Needs attention</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overview.attention.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 px-3 py-6 text-center text-sm text-emerald-800">
                    Nothing urgent right now.
                  </p>
                ) : (
                  overview.attention.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:brightness-[0.98]",
                        item.tone === "danger" &&
                          "border-rose-200 bg-rose-50/80",
                        item.tone === "warn" &&
                          "border-amber-200 bg-amber-50/70",
                        item.tone === "info" && "border-sky-200 bg-sky-50/70",
                      )}
                    >
                      <AttentionIcon tone={item.tone} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.detail}
                        </p>
                      </div>
                      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-gold via-forest to-sky-500" />
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Recent activity</CardTitle>
                {canAccessArea(role, "audit") && (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/admin/audit" />}
                  >
                    Audit log
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.recentActivity.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    {role === "admin"
                      ? "No recent audit events."
                      : "Activity feed is available to admins."}
                  </p>
                ) : (
                  overview.recentActivity.map((log) => (
                    <div
                      key={log._id}
                      className="border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">
                          {log.summary}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 text-[10px]",
                            auditActionBadgeClass(log.action),
                          )}
                        >
                          {log.action}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {log.actorEmail ?? "System"} ·{" "}
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <OverviewCharts
            registrations={overview.registrations}
            bookings={overview.bookings}
            housing={overview.housing}
            emails={overview.emails}
            showRegistrations={canRegistration}
            showAccommodation={canAccommodation}
            showEmails={canEmails}
          />

          {canAccommodation && overview.housing.length > 0 && (
            <Card className="overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-emerald-500" />
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Housing inventory</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/admin/housing" />}
                >
                  Manage
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {overview.housing.map((h) => {
                  const tone = housingCapacityTone(
                    h.remaining,
                    h.capacityLimit,
                  );
                  return (
                    <div
                      key={h._id}
                      className={cn(
                        "rounded-lg border p-3",
                        HOUSING_TONE_CLASS[tone],
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium capitalize">{h.type}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize",
                            tone === "full" &&
                              "border-rose-300 bg-white/70 text-rose-800",
                            tone === "low" &&
                              "border-amber-300 bg-white/70 text-amber-900",
                            tone === "mid" &&
                              "border-sky-300 bg-white/70 text-sky-800",
                            tone === "ok" &&
                              "border-emerald-300 bg-white/70 text-emerald-800",
                          )}
                        >
                          {tone === "full"
                            ? "Full"
                            : tone === "low"
                              ? "Low"
                              : tone === "mid"
                                ? "Filling"
                                : "Available"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {h.booked}/{h.capacityLimit} booked · {h.remaining} left
                      </p>
                      <p className="text-sm font-medium tabular-nums text-ink">
                        ${h.pricePerStay}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {canSeed && sessionToken && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content tools</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await seedData({ sessionToken });
                  toast.success("Default content seeded");
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Failed to seed content",
                  );
                }
              }}
            >
              Seed / refresh default content
            </Button>
            <p className="text-sm text-muted-foreground">
              Safe to re-run — only fills empty content collections.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
