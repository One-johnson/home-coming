"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  BedDouble,
  ClipboardList,
  HelpCircle,
  Info,
  Mail,
  TrendingDown,
  TrendingUp,
  Users,
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
import { cleanErrorMessage } from "@/lib/friendlyError";
import {
  byCurrencyDesc,
  formatMoneyByCurrency,
} from "@/lib/agcPortal";
import { cn } from "@/lib/utils";

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
}: {
  registrations: {
    revenueByCurrency: Record<string, number>;
    awaitingByCurrency: Record<string, number>;
  };
  bookings: {
    revenueByCurrency: Record<string, number>;
    awaitingByCurrency: Record<string, number>;
  };
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

  return (
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
 * currency — cedis and dollars are never summed into one number.
 */
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
}) {
  const surfaceCurrencies = Array.from(
    new Set([
      ...Object.keys(confirmedByCurrency),
      ...Object.keys(awaitingByCurrency),
    ]),
  ).sort(byCurrencyDesc);

  const totalsByCurrency = Object.fromEntries(
    surfaceCurrencies.map((currency) => [
      currency,
      (confirmedByCurrency[currency] ?? 0) +
        (awaitingByCurrency[currency] ?? 0),
    ]),
  );

  return (
    <Link href={href} className="group">
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
          <p className="text-3xl font-semibold tabular-nums text-ink">
            {headline}
          </p>
          <p className="-mt-2 text-xs text-muted-foreground">{headlineNote}</p>
          <div className="flex flex-wrap gap-1.5">{chips}</div>
          <div className="space-y-0.5 border-t border-border/70 pt-2 text-xs">
            <p className="text-muted-foreground">
              Confirmed:{" "}
              <span className="font-semibold tabular-nums text-emerald-700">
                {formatMoneyByCurrency(confirmedByCurrency)}
              </span>
            </p>
            {formatMoneyByCurrency(awaitingByCurrency) !== "—" && (
              <p className="text-muted-foreground">
                Awaiting review:{" "}
                <span className="font-medium tabular-nums text-amber-700">
                  {formatMoneyByCurrency(awaitingByCurrency)}
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
        </CardContent>
      </Card>
    </Link>
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
}) {
  const totalFor = (currency: string) =>
    (registrations.revenueByCurrency[currency] ?? 0) +
    (registrations.awaitingByCurrency[currency] ?? 0) +
    (bookings.revenueByCurrency[currency] ?? 0) +
    (bookings.awaitingByCurrency[currency] ?? 0);

  // GHS and USD always get a board; unknown currencies join in stable order.
  const currencies = Array.from(
    new Set([
      "GHS",
      "USD",
      ...Object.keys(registrations.revenueByCurrency),
      ...Object.keys(registrations.awaitingByCurrency),
      ...Object.keys(bookings.revenueByCurrency),
      ...Object.keys(bookings.awaitingByCurrency),
    ]),
  ).sort(byCurrencyDesc);

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
        />
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
            />
          )}

          {isFinanceView && (
            <FinanceStatsCards
              registrations={overview.registrations}
              bookings={overview.bookings}
            />
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
