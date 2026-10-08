"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BedDouble,
  Layers,
  ClipboardList,
  HandCoins,
  HelpCircle,
  Info,
  Mail,
  TrendingDown,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@convex/_generated/api";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OverviewCharts } from "@/components/admin/OverviewCharts";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ADMIN_CHART,
  HOUSING_TONE_CLASS,
  KPI_ACCENTS,
  auditActionBadgeClass,
  housingCapacityTone,
} from "@/lib/adminColors";
import { canAccessArea } from "@/lib/adminRoles";
import { EVENT } from "@/lib/eventConfig";
import { cleanErrorMessage } from "@/lib/friendlyError";
import {
  AGEING_BUCKET_LABELS,
  byCurrencyDesc,
  currencyFilterLabel,
  formatMoneyByCurrency,
  matchesCurrencyFilter,
  type AgeingBucketKey,
  type CurrencyFilter,
} from "@/lib/agcPortal";
import { cn } from "@/lib/utils";

/** One awaiting-review age bucket as delivered by getAgcOverview. */
type AgeBucket = {
  label: string;
  count: number;
  moneyByCurrency: Record<string, number>;
};

type AgcOverview = {
  /** True when signed in as finance — the client then hides non-finance widgets. */
  financeView: boolean;
  registrations: {
    total: number;
    delegates: number;
    confirmed: number;
    pending: number;
    rejected: number;
    /** Confirmed revenue per currency — cedis and dollars are never summed. */
    revenueByCurrency: Record<string, number>;
    /** Money awaiting finance review, per currency. */
    awaitingByCurrency: Record<string, number>;
    revenueLabel: string;
    awaitingLabel: string;
    thisWeek: number;
    lastWeek: number;
    regionBreakdown: Record<string, number>;
    modeBreakdown: Record<string, number>;
    last7Days: { label: string; count: number }[];
  };
  bookings: {
    total: number;
    activeGuests: number;
    confirmed: number;
    pending: number;
    /** Confirmed revenue per currency — cedis and dollars are never summed. */
    revenueByCurrency: Record<string, number>;
    /** Money awaiting finance review, per currency. */
    awaitingByCurrency: Record<string, number>;
    revenueLabel: string;
    awaitingLabel: string;
    thisWeek: number;
  };
  /** Payment-on-arrival cash still to collect at check-in (IOU records). */
  poa: {
    outstandingRegistrations: number;
    outstandingBookings: number;
    outstandingCount: number;
    outstandingByCurrency: Record<string, number>;
    outstandingLabel: string;
  };
  /** Confirmed revenue per day (per surface, per currency) — last 7 days. */
  revenueTrend: {
    label: string;
    date: string;
    regs: Record<string, number>;
    acc: Record<string, number>;
  }[];
  /** Money per hub across both surfaces, always per currency. */
  hubBreakdown: {
    hubId: string;
    hubName: string;
    registrationsCount: number;
    registrationsRevenueByCurrency: Record<string, number>;
    registrationsAwaitingByCurrency: Record<string, number>;
    bookingsCount: number;
    bookingsRevenueByCurrency: Record<string, number>;
    bookingsAwaitingByCurrency: Record<string, number>;
  }[];
  /** Awaiting-review ageing buckets per surface as delivered by getAgcOverview.
   */
  ageing: {
    registrations: AgeBucket[];
    bookings: AgeBucket[];
  };
  housing: {
    _id: string;
    type: string;
    capacityLimit: number;
    booked: number;
    remaining: number;
    pricePerStay: number;
  }[];
  content: { faqs: number; videos: number };
  emails: {
    total: number;
    pending: number;
    stub: number;
    sent: number;
    failed: number;
  };
  storage: {
    totalBytes: number;
    fileCount: number;
    galleryFiles: number;
    receiptFiles: number;
    heroTourFiles: number;
    otherFiles: number;
  };
  attention: {
    id: string;
    label: string;
    detail: string;
    href: string;
    tone: "warn" | "danger" | "info";
  }[];
  recentActivity: {
    _id: string;
    action: string;
    summary: string;
    actorEmail: string | null;
    createdAt: number;
  }[];
};

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

/**
 * One tile per currency when both cedis and dollars are in play, so a finance
 * admin can read each ledger side without cross-currency arithmetic. Each row
 * stays within one currency.
 */
function CurrencyMoneyTiles({
  registrations,
  bookings,
  currencyFilter,
}: {
  registrations: {
    revenueByCurrency: Record<string, number>;
    awaitingByCurrency: Record<string, number>;
  };
  bookings: {
    revenueByCurrency: Record<string, number>;
    awaitingByCurrency: Record<string, number>;
  };
  currencyFilter: CurrencyFilter;
}) {
  const currencies = Array.from(
    new Set([
      ...Object.keys(registrations.revenueByCurrency),
      ...Object.keys(registrations.awaitingByCurrency),
      ...Object.keys(bookings.revenueByCurrency),
      ...Object.keys(bookings.awaitingByCurrency),
    ]),
  ).sort(byCurrencyDesc);

  if (currencies.length < 2) return null;

  // Honor the shared currency focus — when a currency is selected, render
  // only that ledger board (finance surface cards already show headline
  // numbers filtered the same way).
  const visibleCurrencies =
    currencyFilter === "ALL"
      ? currencies
      : currencies.filter((currency) => currency === currencyFilter);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visibleCurrencies.map((currency) => {
        const rows = [
          {
            label: "Registrations · confirmed",
            value: registrations.revenueByCurrency[currency] ?? 0,
          },
          {
            label: "Registrations · awaiting review",
            value: registrations.awaitingByCurrency[currency] ?? 0,
          },
          {
            label: "Accommodation · confirmed",
            value: bookings.revenueByCurrency[currency] ?? 0,
          },
          {
            label: "Accommodation · awaiting review",
            value: bookings.awaitingByCurrency[currency] ?? 0,
          },
        ];
        const total = rows.reduce((sum, row) => sum + row.value, 0);
        return (
          <Card key={currency} className="overflow-hidden">
            <div
              className={cn(
                "h-1 w-full",
                currency === "GHS"
                  ? "bg-gradient-to-r from-gold to-amber-400"
                  : "bg-gradient-to-r from-sky-500 to-emerald-400",
              )}
            />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {currency === "GHS"
                  ? "Cedis (GHS)"
                  : currency === "USD"
                    ? "Dollars (USD)"
                    : currency}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {rows.map((row) => (
                <p
                  key={row.label}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium tabular-nums text-ink">
                    {formatMoneyByCurrency({ [currency]: row.value })}
                  </span>
                </p>
              ))}
              <p className="flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                <span className="font-medium">Total · confirmed + awaiting</span>
                <span className="font-semibold tabular-nums text-ink">
                  {formatMoneyByCurrency({ [currency]: total })}
                </span>
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Human title for a currency ledger column. */
function currencyTitle(currency: string): string {
  if (currency === "GHS") return "Cedis (GHS)";
  if (currency === "USD") return "Dollars (USD)";
  return currency;
}

/**
 * One finance surface (registrations or accommodation) as a stat card:
 * volume headline and status chips on top, then every money line held per
 * currency — cedis and dollars are never summed into one number. The
 * headline opens the surface's console; drill-down links open the review
 * queues pre-filtered (drill-downs can't nest inside the card link).
 */
/**
 * Payment-on-arrival cash the venue desk must still collect at check-in.
 * Kept out of the registrations/accommodation "awaiting review" boards —
 * POA money is IOU cash on the day, not receipt-verification workload.
 */
function PoaOutstandingCard({
  poa,
  currencyFilter,
}: {
  poa: {
    outstandingRegistrations: number;
    outstandingBookings: number;
    outstandingCount: number;
    outstandingByCurrency: Record<string, number>;
  };
  currencyFilter: CurrencyFilter;
}) {
  const outstanding: Record<string, number> =
    currencyFilter === "ALL"
      ? poa.outstandingByCurrency
      : Object.fromEntries(
          Object.entries(poa.outstandingByCurrency).filter(([currency]) =>
            matchesCurrencyFilter(currency, currencyFilter),
          ),
        );
  const accent = KPI_ACCENTS.poa;
  return (
    <div className="group">
      <Card
        className={cn(
          "h-full overflow-hidden bg-gradient-to-br transition-all group-hover:shadow-sm",
          accent.tint,
          accent.border,
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Payment on arrival · outstanding
          </CardTitle>
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              accent.icon,
            )}
          >
            <HandCoins className="size-4" />
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link
            href="/admin/registrations?tab=poa"
            className="block w-fit text-3xl font-semibold tabular-nums text-ink underline-offset-4 hover:underline"
          >
            {poa.outstandingCount}
          </Link>
          <p className="-mt-2 text-xs text-muted-foreground">
            IOU record{poa.outstandingCount === 1 ? "" : "s"} · cash to collect
            at check-in
          </p>
          <div className="flex flex-wrap gap-1.5">
            <StatusChip
              label="registrations"
              value={poa.outstandingRegistrations}
              tone="warn"
            />
            <StatusChip
              label="bookings"
              value={poa.outstandingBookings}
              tone="warn"
            />
          </div>
          <div className="space-y-0.5 border-t border-border/70 pt-2 text-xs">
            <p className="text-muted-foreground">
              Uncollected:{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  poa.outstandingCount > 0 ? "text-violet-700" : "text-emerald-700",
                )}
              >
                {formatMoneyByCurrency(outstanding)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2.5 text-xs"
              nativeButton={false}
              render={<Link href="/admin/registrations?tab=poa" />}
            >
              Registrations POA
              <ArrowUpRight className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2.5 text-xs"
              nativeButton={false}
              render={<Link href="/admin/accommodation?tab=poa" />}
            >
              Accommodation POA
              <ArrowUpRight className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceSurfaceCard({
  href,
  accent,
  icon,
  title,
  headline,
  headlineNote,
  chips,
  confirmedByCurrency,
  awaitingByCurrency,
  currencyFilter,
  links,
}: {
  href: string;
  accent: { icon: string; border: string; tint: string };
  icon: ReactNode;
  title: string;
  headline: number;
  headlineNote: string;
  chips: ReactNode;
  confirmedByCurrency: Record<string, number>;
  awaitingByCurrency: Record<string, number>;
  currencyFilter: CurrencyFilter;
  /** Pre-filtered review-queue links, rendered under the money lines. */
  links?: { label: string; href: string }[];
}) {
  // The currency focus is a lens on the ledger maps: rows outside the focus
  // disappear (ALL shows everything), so a filtered card never sums across
  // currencies and totals re-derive from only the visible ledgers.
  const confirmed: Record<string, number> =
    currencyFilter === "ALL"
      ? confirmedByCurrency
      : Object.fromEntries(
          Object.entries(confirmedByCurrency).filter(([currency]) =>
            matchesCurrencyFilter(currency, currencyFilter),
          ),
        );
  const awaiting: Record<string, number> =
    currencyFilter === "ALL"
      ? awaitingByCurrency
      : Object.fromEntries(
          Object.entries(awaitingByCurrency).filter(([currency]) =>
            matchesCurrencyFilter(currency, currencyFilter),
          ),
        );
  const surfaceCurrencies = Array.from(
    new Set([...Object.keys(confirmed), ...Object.keys(awaiting)]),
  ).sort(byCurrencyDesc);

  const totalsByCurrency = Object.fromEntries(
    surfaceCurrencies.map((currency) => [
      currency,
      (confirmed[currency] ?? 0) + (awaiting[currency] ?? 0),
    ]),
  );

  return (
    <div className="group">
      <Card
        className={cn(
          "h-full overflow-hidden bg-gradient-to-br transition-all group-hover:shadow-sm",
          accent.tint,
          accent.border,
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              accent.icon,
            )}
          >
            {icon}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link
            href={href}
            className="block w-fit text-3xl font-semibold tabular-nums text-ink underline-offset-4 hover:underline"
          >
            {headline}
          </Link>
          <p className="-mt-2 text-xs text-muted-foreground">{headlineNote}</p>
          <div className="flex flex-wrap gap-1.5">{chips}</div>
          <div className="space-y-0.5 border-t border-border/70 pt-2 text-xs">
            <p className="text-muted-foreground">
              Confirmed:{" "}
              <span className="font-semibold tabular-nums text-emerald-700">
                {formatMoneyByCurrency(confirmed)}
              </span>
            </p>
            {formatMoneyByCurrency(awaiting) !== "—" && (
              <p className="text-muted-foreground">
                Awaiting review:{" "}
                <span className="font-medium tabular-nums text-amber-700">
                  {formatMoneyByCurrency(awaiting)}
                </span>
              </p>
            )}
            <p className="text-muted-foreground">
              Total · confirmed + awaiting:{" "}
              <span className="font-semibold tabular-nums text-ink">
                {formatMoneyByCurrency(totalsByCurrency)}
              </span>
            </p>
          </div>
          {links && links.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-2">
              {links.map((link) => (
                <Button
                  key={link.href}
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2.5 text-xs"
                  nativeButton={false}
                  render={<Link href={link.href} />}
                >
                  {link.label}
                  <ArrowUpRight className="size-3.5" />
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * All / GHS / USD focus control — one statement of which cedis-and-dollars
 * lens the finance stat cards read through.
 */
function CurrencyFocusToggle({
  value,
  onChange,
}: {
  value: CurrencyFilter;
  onChange: (next: CurrencyFilter) => void;
}) {
  const options: CurrencyFilter[] = ["ALL", "GHS", "USD"];
  return (
    <div
      role="group"
      aria-label="Currency focus"
      className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "h-7 gap-1 rounded-md px-3 text-xs font-medium",
            value === option
              ? "bg-background text-ink shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option === "ALL" ? (
            <>
              <Layers className="size-3.5" /> All
            </>
          ) : (
            <Banknote className="size-3.5" />
          )}
          {option === "ALL" ? null : option}
        </Button>
      ))}
    </div>
  );
}

/**
 * Per-day confirmed revenue trend — Registrations and Accommodation bars
 * per day, every series held inside one currency. In the All view the
 * currency segments stack within each surface's bar so cedis and dollars
 * are visibly separate; a focused currency renders two plain bars. The
 * range picker slices the same 30-day server payload to 7 / 14 / 30 days.
 */
const TREND_RANGES = [7, 14, 30] as const;
type TrendRange = (typeof TREND_RANGES)[number];

function RevenueTrendCard({
  revenueTrend,
  currencyFilter,
}: {
  revenueTrend: { label: string; date: string; regs: Record<string, number>; acc: Record<string, number> }[];
  currencyFilter: CurrencyFilter;
}) {
  const [rangeDays, setRangeDays] = useState<TrendRange>(7);
  const days = revenueTrend.slice(-rangeDays);
  const allMode = currencyFilter === "ALL";

  const series: {
    key: string;
    label: string;
    color: string;
    stackId?: string;
  }[] = allMode
    ? [
        { key: "regsGhs", label: "Regs · GHS", color: ADMIN_CHART.gold, stackId: "regs" },
        { key: "regsUsd", label: "Regs · USD", color: ADMIN_CHART.sky, stackId: "regs" },
        { key: "accGhs", label: "Accom · GHS", color: ADMIN_CHART.forest, stackId: "acc" },
        { key: "accUsd", label: "Accom · USD", color: ADMIN_CHART.violet, stackId: "acc" },
      ]
    : currencyFilter === "GHS"
      ? [
          { key: "regs", label: "Registrations", color: ADMIN_CHART.gold },
          { key: "acc", label: "Accommodation", color: ADMIN_CHART.forest },
        ]
      : [
          { key: "regs", label: "Registrations", color: ADMIN_CHART.sky },
          { key: "acc", label: "Accommodation", color: ADMIN_CHART.violet },
        ];

  const rows = days.map((day) => {
    const row: Record<string, string | number> = {
      label: rangeDays <= 7 ? day.label : day.date.slice(5).replace("-", "/"),
      date: day.date,
    };
    if (allMode) {
      row.regsGhs = day.regs.GHS ?? 0;
      row.regsUsd = day.regs.USD ?? 0;
      row.accGhs = day.acc.GHS ?? 0;
      row.accUsd = day.acc.USD ?? 0;
    } else {
      row.regs = day.regs[currencyFilter] ?? 0;
      row.acc = day.acc[currencyFilter] ?? 0;
    }
    return row;
  });

  const hasAny = rows.some((row) =>
    series.some((s) => (row[s.key] as number) > 0),
  );

  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-sky-500" />
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">
            Confirmed revenue · last {rangeDays} days
          </CardTitle>
          <CardDescription className="text-xs">
            {allMode
              ? "Currency segments stay separate inside each bar — never summed."
              : `${currencyFilterLabel(currencyFilter)} · registrations and accommodation bars per day.`}
          </CardDescription>
        </div>
        <div
          role="group"
          aria-label="Trend range"
          className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5"
        >
          {TREND_RANGES.map((range) => (
            <Button
              key={range}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={rangeDays === range}
              onClick={() => setRangeDays(range)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium",
                rangeDays === range
                  ? "bg-background text-ink shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {range}d
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <EmptyTrend message={`No confirmed revenue in the last ${rangeDays} days.`} />
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={ADMIN_CHART.grid}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: ADMIN_CHART.stone, fontSize: 11 }}
                  interval={0}
                  height={38}
                  angle={rangeDays > 7 ? -35 : 0}
                  textAnchor={rangeDays > 7 ? "end" : "middle"}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: ADMIN_CHART.stone, fontSize: 11 }}
                  width={56}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v)
                  }
                />
                <RechartsTooltip
                  content={(
                    props: unknown,
                  ) => {
                    const {
                      active,
                      payload,
                      label,
                    } = props as {
                      active?: boolean;
                      payload?: readonly {
                        name?: unknown;
                        value?: number;
                        color?: string;
                        dataKey?: string | number;
                      }[];
                      label?: unknown;
                    };
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-elevate">
                        <p className="mb-1 font-medium text-ink">{String(label)}</p>
                        {payload.map((entry) => (
                          <p
                            key={String(entry.dataKey)}
                            className="text-muted-foreground"
                          >
                            <span style={{ color: entry.color }}>
                              {String(entry.name)}
                            </span>{" "}
                            <span className="font-medium tabular-nums text-ink">
                              {entry.value?.toLocaleString()}
                            </span>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <RechartsLegend
                  verticalAlign="bottom"
                  height={28}
                  formatter={(value) => (
                    <span className="text-xs font-medium text-ink/80">{value}</span>
                  )}
                />
                {series.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    stackId={s.stackId}
                    radius={s.stackId ? undefined : [4, 4, 0, 0]}
                    maxBarSize={rangeDays > 14 ? 12 : rangeDays > 7 ? 18 : 28}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyTrend({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/**
 * Awaiting-review ageing — how long money has sat unverified. Every bucket
 * keeps its money per currency; the 7+ day bucket is the escalator. Buckets
 * with money deep-link into the review queue pre-filtered to that age span.
 */
function AgeingTiles({
  ageing,
}: {
  ageing: {
    registrations: AgeBucket[];
    bookings: AgeBucket[];
  };
}) {
  const sections = [
    {
      title: "Registrations ageing",
      buckets: ageing.registrations,
      queueHref: "/admin/registrations",
    },
    {
      title: "Accommodation ageing",
      buckets: ageing.bookings,
      queueHref: "/admin/finance/accommodations",
    },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-rose-400 via-amber-400 to-sky-400" />
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Awaiting review ageing</CardTitle>
        <CardDescription className="text-xs">
          How long unverified money has been sitting — the 7+ day bucket needs
          chasing today.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {section.title}
            </p>
            {section.buckets.map((bucket) => {
              const stale = bucket.label.startsWith("7+");
              const bucketKey = (
                Object.entries(AGEING_BUCKET_LABELS) as [
                  AgeingBucketKey,
                  string,
                ][]
              ).find(([, label]) => label === bucket.label)?.[0];
              const rowClasses = cn(
                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
                stale && bucket.count > 0
                  ? "border-rose-200 bg-rose-50/70"
                  : "border-border/70 bg-muted/30",
                bucketKey &&
                  bucket.count > 0 &&
                  "transition-colors hover:brightness-[0.98]",
              );
              const inner = (
                <>
                  <div>
                    <p className="text-sm font-medium">{bucket.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {bucket.count} item{bucket.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-right text-sm font-semibold tabular-nums",
                      stale && bucket.count > 0 ? "text-rose-700" : "text-ink",
                    )}
                  >
                    {bucket.count === 0
                      ? "—"
                      : formatMoneyByCurrency(bucket.moneyByCurrency)}
                  </span>
                </>
              );
              if (!bucketKey || bucket.count === 0) {
                return (
                  <div key={bucket.label} className={rowClasses}>
                    {inner}
                  </div>
                );
              }
              return (
                <Link
                  key={bucket.label}
                  href={`${section.queueHref}?age=${bucketKey}`}
                  className={rowClasses}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Per-hub money table — one row per hub across both surfaces, per currency.
 * USD splits into dedicated columns so cedis and dollar columns are never
 * forced to share a number; every column stays mono-currency. Exports as
 * one CSV row per hub and currency.
 */
function HubMoneyTable({
  hubBreakdown,
  currencyFilter,
}: {
  hubBreakdown: {
    hubId: string;
    hubName: string;
    registrationsCount: number;
    registrationsRevenueByCurrency: Record<string, number>;
    registrationsAwaitingByCurrency: Record<string, number>;
    bookingsCount: number;
    bookingsRevenueByCurrency: Record<string, number>;
    bookingsAwaitingByCurrency: Record<string, number>;
  }[];
  currencyFilter: CurrencyFilter;
}) {
  type HubRow = (typeof hubBreakdown)[number];

  const columns = useMemo<ColumnDef<HubRow>[]>(
    () => [
      { accessorKey: "hubName", header: "Hub" },
      { id: "regs", header: "Regs (n)", accessorFn: (h) => h.registrationsCount },
      { id: "regGhs", header: "Regs GHS total", accessorFn: (h) => h.registrationsRevenueByCurrency.GHS ?? 0 },
      { id: "regGhsA", header: "Regs GHS awaiting", accessorFn: (h) => h.registrationsAwaitingByCurrency.GHS ?? 0 },
      { id: "regUsd", header: "Regs USD total", accessorFn: (h) => h.registrationsRevenueByCurrency.USD ?? 0 },
      { id: "regUsdA", header: "Regs USD awaiting", accessorFn: (h) => h.registrationsAwaitingByCurrency.USD ?? 0 },
      { id: "accN", header: "Accom (n)", accessorFn: (h) => h.bookingsCount },
      { id: "accGhs", header: "Accom GHS total", accessorFn: (h) => h.bookingsRevenueByCurrency.GHS ?? 0 },
      { id: "accGhsA", header: "Accom GHS awaiting", accessorFn: (h) => h.bookingsAwaitingByCurrency.GHS ?? 0 },
      { id: "accUsd", header: "Accom USD total", accessorFn: (h) => h.bookingsRevenueByCurrency.USD ?? 0 },
      { id: "accUsdA", header: "Accom USD awaiting", accessorFn: (h) => h.bookingsAwaitingByCurrency.USD ?? 0 },
    ],
    [],
  );

  const hasData = hubBreakdown.length > 0;
  const selectedCurrencyLabel =
    currencyFilter === "ALL"
      ? "all columns (GHS and USD)"
      : currencyFilterLabel(currencyFilter);

  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-forest via-sky-500 to-gold" />
      <CardHeader className="pb-1">
        <CardTitle className="text-base">Money by hub</CardTitle>
        <CardDescription className="text-xs">
          Per-hub registrations and accommodation money. Every column stays in
          one currency — showing {selectedCurrencyLabel}. Use the column picker
          to focus a currency, and Export CSV for the full sheet.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {hasData ? (
          <DataTable
            columns={columns}
            data={hubBreakdown}
            searchPlaceholder="Search hub…"
            getRowId={(row) => row.hubId}
            exportFilename="finance-hub-money.csv"
            exportRow={(row) => ({
              hub: row.hubName,
              registrationsCount: row.registrationsCount,
              registrationsGhsTotal:
                row.registrationsRevenueByCurrency.GHS ?? 0,
              registrationsGhsAwaiting:
                row.registrationsAwaitingByCurrency.GHS ?? 0,
              registrationsUsdTotal:
                row.registrationsRevenueByCurrency.USD ?? 0,
              registrationsUsdAwaiting:
                row.registrationsAwaitingByCurrency.USD ?? 0,
              accommodationsCount: row.bookingsCount,
              accommodationGhsTotal:
                row.bookingsRevenueByCurrency.GHS ?? 0,
              accommodationGhsAwaiting:
                row.bookingsAwaitingByCurrency.GHS ?? 0,
              accommodationUsdTotal:
                row.bookingsRevenueByCurrency.USD ?? 0,
              accommodationUsdAwaiting:
                row.bookingsAwaitingByCurrency.USD ?? 0,
            })}
            emptyMessage="No hub money yet."
            isLoading={false}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            No hub money yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Finance totals block — stat cards for each money surface (registrations,
 * accommodation) plus one board per currency (GHS, USD), where every number
 * stays inside a single currency so nothing is ever summed across cedis and
 * dollars.
 */
function FinanceStatsCards({
  registrations,
  bookings,
  poa,
  currencyFilter,
}: {
  registrations: {
    total: number;
    delegates: number;
    confirmed: number;
    pending: number;
    rejected: number;
    revenueByCurrency: Record<string, number>;
    awaitingByCurrency: Record<string, number>;
  };
  bookings: {
    total: number;
    confirmed: number;
    pending: number;
    activeGuests: number;
    revenueByCurrency: Record<string, number>;
    awaitingByCurrency: Record<string, number>;
  };
  poa: {
    outstandingRegistrations: number;
    outstandingBookings: number;
    outstandingCount: number;
    outstandingByCurrency: Record<string, number>;
  };
  currencyFilter: CurrencyFilter;
}) {
  const totalFor = (currency: string) =>
    (registrations.revenueByCurrency[currency] ?? 0) +
    (registrations.awaitingByCurrency[currency] ?? 0) +
    (bookings.revenueByCurrency[currency] ?? 0) +
    (bookings.awaitingByCurrency[currency] ?? 0);

  // GHS and USD always get a board in the All view; unknown currencies join
  // in stable order. A focused currency collapses the boards to that ledger.
  const currencies = Array.from(
    new Set([
      "GHS",
      "USD",
      ...Object.keys(registrations.revenueByCurrency),
      ...Object.keys(registrations.awaitingByCurrency),
      ...Object.keys(bookings.revenueByCurrency),
      ...Object.keys(bookings.awaitingByCurrency),
    ]),
  )
    .sort(byCurrencyDesc)
    .filter(
      (currency) =>
        currencyFilter === "ALL" || currency === currencyFilter,
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FinanceSurfaceCard
          href="/admin/registrations"
          accent={KPI_ACCENTS.registrations}
          icon={<ClipboardList className="size-4" />}
          title="Registrations totals"
          headline={registrations.total}
          headlineNote={`submission${registrations.total === 1 ? "" : "s"} · ${registrations.delegates} delegate${registrations.delegates === 1 ? "" : "s"}`}
          chips={
            <>
              <StatusChip
                label="confirmed"
                value={registrations.confirmed}
                tone="ok"
              />
              <StatusChip
                label="awaiting review"
                value={registrations.pending}
                tone="warn"
              />
              {registrations.rejected > 0 && (
                <StatusChip
                  label="rejected"
                  value={registrations.rejected}
                  tone="danger"
                />
              )}
            </>
          }
          confirmedByCurrency={registrations.revenueByCurrency}
          awaitingByCurrency={registrations.awaitingByCurrency}
          currencyFilter={currencyFilter}
          links={[
            {
              label: "Review awaiting",
              href: "/admin/registrations?status=pending_verification",
            },
            {
              label: "Confirmed",
              href: "/admin/registrations?status=confirmed",
            },
          ]}
        />
        <FinanceSurfaceCard
          href="/admin/finance/accommodations"
          accent={KPI_ACCENTS.bookings}
          icon={<BedDouble className="size-4" />}
          title="Accommodation totals"
          headline={bookings.total}
          headlineNote={`booking${bookings.total === 1 ? "" : "s"} · ${bookings.activeGuests} active guest${bookings.activeGuests === 1 ? "" : "s"}`}
          chips={
            <>
              <StatusChip
                label="confirmed"
                value={bookings.confirmed}
                tone="ok"
              />
              <StatusChip
                label="awaiting review"
                value={bookings.pending}
                tone="warn"
              />
            </>
          }
          confirmedByCurrency={bookings.revenueByCurrency}
          awaitingByCurrency={bookings.awaitingByCurrency}
          currencyFilter={currencyFilter}
          links={[
            {
              label: "Review awaiting",
              href: "/admin/finance/accommodations?paymentStatus=pending_verification",
            },
            {
              label: "Confirmed",
              href: "/admin/finance/accommodations?paymentStatus=confirmed",
            },
          ]}
        />
        <PoaOutstandingCard poa={poa} currencyFilter={currencyFilter} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {currencies.map((currency) => {
          const rows = [
            {
              label: "Registrations · confirmed",
              value: registrations.revenueByCurrency[currency] ?? 0,
            },
            {
              label: "Registrations · awaiting review",
              value: registrations.awaitingByCurrency[currency] ?? 0,
            },
            {
              label: "Accommodation · confirmed",
              value: bookings.revenueByCurrency[currency] ?? 0,
            },
            {
              label: "Accommodation · awaiting review",
              value: bookings.awaitingByCurrency[currency] ?? 0,
            },
          ];
          return (
            <Card key={currency} className="overflow-hidden">
              <div
                className={cn(
                  "h-1 w-full",
                  currency === "GHS"
                    ? "bg-gradient-to-r from-gold to-amber-400"
                    : "bg-gradient-to-r from-sky-500 to-emerald-400",
                )}
              />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                  <span>{currencyTitle(currency)}</span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg",
                      currency === "GHS"
                        ? "bg-gold/15 text-gold-dark"
                        : "bg-sky-100 text-sky-700",
                    )}
                  >
                    <Banknote className="size-4" />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {rows.map((row) => (
                  <p
                    key={row.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-medium tabular-nums text-ink">
                      {formatMoneyByCurrency({ [currency]: row.value })}
                    </span>
                  </p>
                ))}
                <p className="flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                  <span className="font-medium">
                    Total · registrations + accommodation
                  </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatMoneyByCurrency({ [currency]: totalFor(currency) })}
                  </span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
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
    api.agcAdminData.getAgcOverview,
    sessionArgs ? sessionArgs : "skip",
  ) as AgcOverview | undefined;

  const canRegistration = canAccessArea(role, "registration");
  const canAccommodation = canAccessArea(role, "accommodation");
  const canContent = canAccessArea(role, "content");
  const canEmails = canAccessArea(role, "emails");
  const canSeed = canAccessArea(role, "seed");
  // Server truth once loaded; role check before then avoids flashing
  // non-finance widgets for the finance role.
  const isFinanceView = overview ? overview.financeView : role === "finance";
  // Finance currency focus — All / GHS / USD lens for every finance widget.
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("ALL");
  const firstName = user?.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`Welcome back${firstName ? `, ${firstName}` : ""}. ${EVENT.dates} · ${EVENT.location}`}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/" target="_blank" rel="noopener noreferrer" />}
            >
              View public site
              <ArrowUpRight className="size-4" />
            </Button>
            {canRegistration && (
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/admin/registrations" />}
              >
                Registrations console
                <ArrowUpRight className="size-4" />
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
            {canRegistration && !isFinanceView && (
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
                      {overview.registrations.delegates}
                    </p>
                    <p className="-mt-2 text-xs text-muted-foreground">
                      delegates · {overview.registrations.total} submission
                      {overview.registrations.total === 1 ? "" : "s"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip
                        label="confirmed"
                        value={overview.registrations.confirmed}
                        tone="ok"
                      />
                      <StatusChip
                        label="awaiting review"
                        value={overview.registrations.pending}
                        tone="warn"
                      />
                      {overview.registrations.rejected > 0 && (
                        <StatusChip
                          label="rejected"
                          value={overview.registrations.rejected}
                          tone="danger"
                        />
                      )}
                    </div>
                    <div className="space-y-0.5 text-xs">
                      <p className="text-muted-foreground">
                        Confirmed revenue:{" "}
                        <span className="font-semibold tabular-nums text-emerald-700">
                          {formatMoneyByCurrency(
                            overview.registrations.revenueByCurrency,
                          )}
                        </span>
                      </p>
                      {overview.registrations.awaitingLabel !== "—" && (
                        <p className="text-muted-foreground">
                          Awaiting review:{" "}
                          <span className="font-medium tabular-nums text-amber-700">
                            {overview.registrations.awaitingLabel}
                          </span>
                        </p>
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
              <Link href="/admin/accommodation" className="group">
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
                      {overview.bookings.activeGuests}
                    </p>
                    <p className="-mt-2 text-xs text-muted-foreground">
                      active guests · {overview.bookings.confirmed} confirmed
                      booking{overview.bookings.confirmed === 1 ? "" : "s"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusChip
                        label="awaiting review"
                        value={overview.bookings.pending}
                        tone="warn"
                      />
                    </div>
                    <div className="space-y-0.5 text-xs">
                      <p className="font-medium text-muted-foreground">
                        Confirmed:{" "}
                        <span className="font-semibold tabular-nums text-emerald-700">
                          {formatMoneyByCurrency(
                            overview.bookings.revenueByCurrency,
                          )}
                        </span>{" "}
                        · +{overview.bookings.thisWeek} this week
                      </p>
                      {overview.bookings.awaitingLabel !== "—" && (
                        <p className="text-muted-foreground">
                          Awaiting review:{" "}
                          <span className="font-medium tabular-nums text-amber-700">
                            {overview.bookings.awaitingLabel}
                          </span>
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
            {canContent && (
              <Link href="/admin/content" className="group">
                <Card
                  className={cn(
                    "h-full overflow-hidden bg-gradient-to-br transition-all group-hover:shadow-sm",
                    KPI_ACCENTS.faqs.tint,
                    KPI_ACCENTS.faqs.border,
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      FAQs
                    </CardTitle>
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg",
                        KPI_ACCENTS.faqs.icon,
                      )}
                    >
                      <HelpCircle className="size-4" />
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.content.faqs}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Manage FAQs and announcements
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
                    <p className="text-xs text-muted-foreground">
                      Homecoming messages and links
                    </p>
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
                      {overview.emails.pending > 0 && (
                        <StatusChip
                          label="pending"
                          value={overview.emails.pending}
                          tone="warn"
                        />
                      )}
                      {overview.emails.stub > 0 && (
                        <StatusChip
                          label="stub"
                          value={overview.emails.stub}
                          tone="info"
                        />
                      )}
                      {overview.emails.failed > 0 && (
                        <StatusChip
                          label="failed"
                          value={overview.emails.failed}
                          tone="danger"
                        />
                      )}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/40 p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        File storage · {formatBytes(overview.storage.totalBytes)}
                        {" \u00b7 "}
                        {overview.storage.fileCount} file
                        {overview.storage.fileCount === 1 ? "" : "s"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {overview.storage.galleryFiles} gallery ·{" "}
                        {overview.storage.receiptFiles} receipts ·{" "}
                        {overview.storage.heroTourFiles} hero/tours
                        {overview.storage.otherFiles > 0
                          ? ` · ${overview.storage.otherFiles} other`
                          : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>

          {canRegistration && !isFinanceView && (
            <CurrencyMoneyTiles
              registrations={overview.registrations}
              bookings={overview.bookings}
              currencyFilter={currencyFilter}
            />
          )}

          {isFinanceView && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  Money overview
                </h2>
                <CurrencyFocusToggle
                  value={currencyFilter}
                  onChange={setCurrencyFilter}
                />
              </div>
              <FinanceStatsCards
                registrations={overview.registrations}
                bookings={overview.bookings}
                poa={overview.poa}
                currencyFilter={currencyFilter}
              />
              <RevenueTrendCard
                revenueTrend={overview.revenueTrend}
                currencyFilter={currencyFilter}
              />
              <AgeingTiles ageing={overview.ageing} />
              <HubMoneyTable
                hubBreakdown={overview.hubBreakdown}
                currencyFilter={currencyFilter}
              />
            </div>
          )}

          {!isFinanceView && (
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
          )}

          {canRegistration && (
            <OverviewCharts
              registrations={{
                paid: overview.registrations.confirmed,
                pending: overview.registrations.pending,
                failed: overview.registrations.rejected,
                revenueByCurrency: overview.registrations.revenueByCurrency,
                awaitingByCurrency: overview.registrations.awaitingByCurrency,
                regionBreakdown: overview.registrations.regionBreakdown,
                gatewayBreakdown: overview.registrations.modeBreakdown,
                last7Days: overview.registrations.last7Days,
              }}
              bookings={{
                total: overview.bookings.total,
                paid: overview.bookings.confirmed,
                pending: overview.bookings.pending,
                revenueByCurrency: overview.bookings.revenueByCurrency,
                awaitingByCurrency: overview.bookings.awaitingByCurrency,
              }}
              housing={overview.housing}
              emails={
                canEmails
                  ? {
                      pending: overview.emails.pending,
                      stub: overview.emails.stub,
                      sent: overview.emails.sent,
                      failed: overview.emails.failed,
                    }
                  : undefined
              }
              showRegistrations={canRegistration}
              showAccommodation={canAccommodation}
              showEmails={false}
              showHousing={!isFinanceView}
            />
          )}

          {canAccommodation && !isFinanceView && overview.housing.length > 0 && (
            <Card className="overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-emerald-500" />
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  Accommodation capacity
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/admin/accommodation" />}
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
                        {h.booked}/{h.capacityLimit} taken · {h.remaining} left
                      </p>
                      <p className="text-sm font-medium tabular-nums text-ink">
                        <Users className="mr-1 inline size-3.5" />
                        {h.booked} guests
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
                    cleanErrorMessage(err) || "Failed to seed content",
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
