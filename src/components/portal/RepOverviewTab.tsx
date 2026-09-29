"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  BanknoteIcon,
  BedDoubleIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  Loader2Icon,
  ReceiptTextIcon,
  UserCheckIcon,
  UserMinusIcon,
  UserXIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/friendlyError";
import { AGC_REGION_LABELS } from "@/lib/agcPortal";
import { downloadBase64File } from "@/lib/downloadFile";

type RepOverview = {
  hubName: string;
  hubRegion: string;
  repName: string;
  currency: "GHS" | "USD";
  isGhsRegion: boolean;
  deadline: number;
  registrations: {
    count: number;
    paidDelegates: number;
    pendingDelegates: number;
    cancelledDelegates: number;
    paidAmount: number;
    pendingAmount: number;
  };
  accommodation: {
    count: number;
    confirmedBookings: number;
    reservedBookings: number;
    cancelledBookings: number;
    paidGuests: number;
    pendingGuests: number;
    cancelledGuests: number;
    paidAmount: number;
    pendingAmount: number;
  };
  receiptsPending: number;
  awaitingPayment: number;
  totalPaidDelegates: number;
  totalPendingDelegates: number;
  totalCancelledDelegates: number;
};

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Icon className="size-3.5 text-gold-dark" />
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Paid / pending / cancelled delegate trio used for both sections. */
function DelegateBreakdown({
  paid,
  pending,
  cancelled,
}: {
  paid: number;
  pending: number;
  cancelled: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-900 dark:bg-emerald-950">
        <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
          <UserCheckIcon className="size-3" /> Paid
        </p>
        <p className="text-lg font-semibold tabular-nums text-emerald-900 dark:text-emerald-200">
          {paid}
        </p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950">
        <p className="flex items-center gap-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          <UserXIcon className="size-3" /> Awaiting payment
        </p>
        <p className="text-lg font-semibold tabular-nums text-amber-900 dark:text-amber-200">
          {pending}
        </p>
      </div>
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 dark:border-rose-900 dark:bg-rose-950">
        <p className="flex items-center gap-1 text-[11px] font-medium text-rose-800 dark:text-rose-300">
          <UserMinusIcon className="size-3" /> Cancelled
        </p>
        <p className="text-lg font-semibold tabular-nums text-rose-900 dark:text-rose-200">
          {cancelled}
        </p>
      </div>
    </div>
  );
}

export function RepOverviewTab() {
  const { sessionToken } = useRepSession();
  const overview = useQuery(
    api.agcPortal.getRepOverview,
    sessionToken ? { sessionToken } : "skip",
  ) as RepOverview | undefined;

  const exportBookings = useAction(api.agcExcel.exportRepBookingsExcel);
  const exportRegistrations = useAction(
    api.agcExcel.exportRepRegistrationsExcel,
  );
  const [exporting, setExporting] = useState<
    "accommodation" | "registration" | null
  >(null);
  // Ticking clock (kept out of render for react-hooks/purity).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const download = async (
    kind: "accommodation" | "registration",
  ) => {
    if (!sessionToken) return;
    setExporting(kind);
    try {
      const result =
        kind === "accommodation"
          ? await exportBookings({ sessionToken })
          : await exportRegistrations({ sessionToken });
      downloadBase64File(result.filename, result.contentBase64);
      toast.success(`Downloaded ${result.filename}`);
    } catch (err) {
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setExporting(null);
    }
  };

  if (overview === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-1">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const daysLeft = Math.max(
    0,
    Math.ceil((overview.deadline - now) / 86_400_000),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-gold/40 bg-gold/10 text-ink"
        >
          {overview.hubName}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {AGC_REGION_LABELS[overview.hubRegion as keyof typeof AGC_REGION_LABELS] ??
            overview.hubRegion}
        </Badge>
        <Badge
          variant="outline"
          className={
            daysLeft <= 14
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "text-xs"
          }
        >
          <CalendarClockIcon className="mr-1 size-3" />
          {daysLeft} day{daysLeft === 1 ? "" : "s"} to deadline
        </Badge>
        {overview.receiptsPending > 0 && (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            <ReceiptTextIcon className="mr-1 size-3" />
            {overview.receiptsPending} receipt
            {overview.receiptsPending === 1 ? "" : "s"} in review
          </Badge>
        )}
        {overview.awaitingPayment > 0 && (
          <Badge
            variant="outline"
            className="border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
          >
            {overview.awaitingPayment} awaiting payment
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={UserCheckIcon}
          label="Paid delegates"
          value={overview.totalPaidDelegates}
          hint="Counted once payment is confirmed"
        />
        <StatCard
          icon={UsersIcon}
          label="Awaiting payment"
          value={overview.totalPendingDelegates}
          hint="Registrations + accommodation guests"
        />
        <StatCard
          icon={BedDoubleIcon}
          label="Confirmed bookings"
          value={overview.accommodation.confirmedBookings}
          hint={`${overview.accommodation.reservedBookings} on hold`}
        />
        <StatCard
          icon={BanknoteIcon}
          label="Total paid"
          value={`${overview.currency} ${overview.registrations.paidAmount + overview.accommodation.paidAmount}`}
          hint="Registration + accommodation"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardListIcon className="size-4 text-gold-dark" />
              Registration
            </CardTitle>
            <CardDescription>
              {overview.registrations.count} submission
              {overview.registrations.count === 1 ? "" : "s"} · delegates are
              counted as paid only once payment is confirmed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DelegateBreakdown
              paid={overview.registrations.paidDelegates}
              pending={overview.registrations.pendingDelegates}
              cancelled={overview.registrations.cancelledDelegates}
            />
            <p className="text-xs text-muted-foreground">
              Paid: {overview.currency} {overview.registrations.paidAmount} ·
              Awaiting: {overview.currency}{" "}
              {overview.registrations.pendingAmount}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting !== null}
              onClick={() => void download("registration")}
            >
              {exporting === "registration" && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Excel report
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BedDoubleIcon className="size-4 text-gold-dark" />
              Accommodation
            </CardTitle>
            <CardDescription>
              {overview.accommodation.count} booking
              {overview.accommodation.count === 1 ? "" : "s"} ·{" "}
              {overview.accommodation.cancelledBookings} cancelled
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DelegateBreakdown
              paid={overview.accommodation.paidGuests}
              pending={overview.accommodation.pendingGuests}
              cancelled={overview.accommodation.cancelledGuests}
            />
            <p className="text-xs text-muted-foreground">
              Paid: {overview.currency} {overview.accommodation.paidAmount} ·
              Awaiting: {overview.currency}{" "}
              {overview.accommodation.pendingAmount}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting !== null}
              onClick={() => void download("accommodation")}
            >
              {exporting === "accommodation" && (
                <Loader2Icon className="size-4 animate-spin" />
              )}
              Excel report
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
