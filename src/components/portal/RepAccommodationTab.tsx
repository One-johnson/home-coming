"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  type LucideIcon,
  AlertTriangleIcon,
  BedDoubleIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  DownloadIcon,
  EllipsisIcon,
  FileSpreadsheetIcon,
  LayoutGridIcon,
  Loader2Icon,
  PencilIcon,
  ReceiptTextIcon,
  SearchIcon,
  TableIcon,
  Trash2Icon,
  UploadIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import { useIsCompact } from "@/hooks/use-media-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { uploadFileToConvex } from "@/lib/galleryUpload";
import {
  PoaEvidenceDialog,
  PoaIouDialog,
} from "@/components/portal/PoaReceiptDialogs";
import { compressImageForUpload } from "@/lib/imageCompress";
import { downloadBase64File } from "@/lib/downloadFile";
import { friendlyError } from "@/lib/friendlyError";
import { cn } from "@/lib/utils";
import {
  AGC_ACCOMMODATION_LABELS,
  bookingStatusMeta,
} from "@/lib/agcPortal";
import {
  displayPaymentStatus,
  guestAvatarClass,
  guestInitials,
  guestRosterRows,
  isClosedBooking,
} from "@/lib/agcBookingView";
import type {
  AccommodationOverview,
  AccommodationTypeInfo,
  RepBooking,
} from "@/lib/agcBookingTypes";
import type { BookingSummary } from "@/lib/bookingMath";
import type { AgcAccommodationType, AgcRegion } from "@/lib/agcPortal";
import {
  AGC_ACCOMMODATION_TYPES,
  AGC_BISHOP_RATE,
  amountsMatch,
  capacityProblem,
  computeBookingSummary,
  describeUnits,
  typesConfigFromOverview,
} from "@/lib/bookingMath";

const TITLE_OPTIONS = ["Bishop", "Rev.", "Pastor", "Elder", "Mr.", "Mrs.", "Ms.", "Dr."];

type Draft = {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title: string;
  accommodationType: AgcAccommodationType;
  isBishopRate: boolean;
};

type ExcelPreviewRow = {
  rowNumber: number;
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  accommodationType: string;
  isBishopRate: boolean;
};

type ExcelPreview = { rows: ExcelPreviewRow[]; errors: string[] };

const emptyDraft = (): Draft => ({
  firstName: "",
  lastName: "",
  gender: "male",
  title: "Member",
  accommodationType: "dormitory",
  isBishopRate: false,
});

const draftIsValid = (draft: Draft) =>
  draft.firstName.trim().length > 0 && draft.lastName.trim().length > 0;

const BOOKING_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "awaiting", label: "Awaiting payment" },
  { value: "closed", label: "Closed" },
] as const;

type BookingFilter = (typeof BOOKING_FILTERS)[number]["value"];

/** "GHS 1,500" — thousands separators everywhere money is shown. */
function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US")}`;
}

/** Shared by the list filter and the filter chips so counts can't drift. */
function bookingMatchesFilter(booking: RepBooking, filter: BookingFilter) {
  switch (filter) {
    case "active":
      return (
        booking.bookingStatus === "reserved" ||
        booking.bookingStatus === "pending_verification" ||
        booking.bookingStatus === "correction_requested"
      );
    case "awaiting":
      // Closed holds (cancelled/expired) are never "awaiting payment" —
      // they no longer owe anything and must not inflate chase lists.
      return (
        !isClosedBooking(booking) &&
        (booking.paymentStatus === "awaiting_payment" ||
          booking.paymentStatus === "correction_requested")
      );
    case "closed":
      return (
        booking.bookingStatus === "confirmed" ||
        booking.bookingStatus === "cancelled" ||
        booking.bookingStatus === "expired"
      );
    default:
      return true;
  }
}

/** Live hold-countdown chip: amber under 24h, red under 6h. */
function HoldCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const remaining = expiresAt - now;
  if (remaining <= 0) {
    return (
      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
        Hold expired
      </Badge>
    );
  }
  const hours = Math.floor(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  const label =
    days > 0
      ? `${days}d ${hours % 24}h left`
      : hours > 0
        ? `${hours}h left`
        : `${Math.max(1, Math.floor(remaining / 60_000))}m left`;
  const className =
    remaining < 6 * 3_600_000
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : remaining < 24 * 3_600_000
        ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300";
  return (
    <Badge
      variant="outline"
      className={className}
      title={`Hold expires ${new Date(expiresAt).toLocaleString()}`}
    >
      <CalendarClockIcon className="mr-1 size-3" />
      {label}
    </Badge>
  );
}

/** Centered dialog on desktop, bottom sheet on phones/tablets. */
function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}) {
  const isCompact = useIsCompact();

  if (isCompact) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "max-h-[90dvh] gap-0 rounded-t-2xl p-0",
            contentClassName,
          )}
        >
          <div
            className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
            aria-hidden
          />
          <SheetHeader className="shrink-0 gap-1 border-b border-border bg-muted/30 px-4 py-3 text-left">
            <SheetTitle className="text-base">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="text-xs leading-relaxed">
                {description}
              </SheetDescription>
            ) : null}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {children}
          </div>
          {footer ? (
            <SheetFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-h-[85dvh] overflow-y-auto", contentClassName)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

/** One consistent zone heading: icon + title + count badge + right slot. */
function ZoneHeader({
  icon: Icon,
  title,
  badge,
  description,
  right,
}: {
  icon: LucideIcon;
  title: string;
  badge?: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Icon className="size-4 shrink-0 text-gold-dark" />
          {title}
          {badge !== undefined ? (
            <Badge
              variant="outline"
              className="text-[11px] font-normal text-muted-foreground"
            >
              {badge}
            </Badge>
          ) : null}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      {right ? (
        <div className="flex flex-wrap items-center gap-2">{right}</div>
      ) : null}
    </div>
  );
}

/**
 * Capacity board: live pool counts grouped by what actually shares
 * inventory (regional pools vs global pools), with price and bishop price.
 */
function CapacityBoard({
  rows,
  types,
  currency,
  isOffline,
  deadline,
  holdHours,
}: {
  rows: AccommodationOverview["availability"];
  types: AccommodationTypeInfo[];
  currency: string;
  isOffline: boolean;
  deadline: number;
  holdHours: number;
}) {
  const [now] = useState(() => Date.now());
  const msLeft = deadline - now;
  const daysLeft = msLeft > 0 ? Math.ceil(msLeft / 86_400_000) : 0;

  const labelFor = (type: string) =>
    types.find((entry) => entry.type === type)?.label ??
    AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ??
    type;

  const regional = rows.filter((row) => row.scope !== "global");
  const global = rows.filter((row) => row.scope === "global");

  const renderRow = (row: AccommodationOverview["availability"][number]) => {
    const soldOut = row.available <= 0;
    const nearlyGone =
      !soldOut && row.total > 0 && row.available <= Math.ceil(row.total * 0.1);
    const percent =
      row.total > 0
        ? Math.min(100, Math.round((row.available / row.total) * 100))
        : 0;
    const unitNoun = row.scope === "per_room" ? "rooms" : "beds";
    const price = isOffline ? row.priceGhs : row.priceUsd;
    const bishopPrice = isOffline ? row.bishopPriceGhs : row.bishopPriceUsd;

    return (
      <div
        key={row.accommodationType}
        className={cn("rounded-xl border p-3", soldOut && "opacity-70")}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">
            {labelFor(row.accommodationType)}
          </p>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-[10px]",
              soldOut
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : nearlyGone
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
            )}
          >
            {soldOut ? "Sold out" : nearlyGone ? "Nearly gone" : "Open"}
          </Badge>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="text-base font-semibold text-foreground tabular-nums">
            {row.available.toLocaleString("en-US")}
          </span>{" "}
          of {row.total.toLocaleString("en-US")} {unitNoun} left
        </p>
        <div
          aria-hidden
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              soldOut
                ? "bg-destructive/70"
                : nearlyGone
                  ? "bg-amber-500"
                  : "bg-emerald-500",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
          {formatMoney(price, currency)} / bed
          {row.accommodationType === "ebpv" &&
            ` · bishop ${formatMoney(bishopPrice, currency)}`}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "text-[11px] font-normal",
            daysLeft > 0 && daysLeft <= 7
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "text-muted-foreground",
          )}
        >
          <CalendarClockIcon className="mr-1 size-3" />
          {daysLeft > 0
            ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left — closes`
            : "Closes"}{" "}
          {new Date(deadline).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}
        </Badge>
        <Badge
          variant="outline"
          className="text-[11px] font-normal text-muted-foreground"
        >
          Holds last {holdHours}h
        </Badge>
      </div>
      {regional.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Shared with hubs in your region
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {regional.map(renderRow)}
          </div>
        </div>
      ) : null}
      {global.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Shared across all regions
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {global.map(renderRow)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Guest row: compact summary header (tappable on mobile) over the priced
 * fields. Shared by the create builder and the edit dialog.
 */
function GuestRowEditor({
  draft,
  index,
  variant = "create",
  expanded = true,
  onToggle,
  onChange,
  onRemove,
  currency,
  accommodationTypes,
  availabilityFor,
  priceFor,
  bishopAmountLabel,
}: {
  draft: Draft;
  index: number;
  variant?: "create" | "edit";
  expanded?: boolean;
  onToggle?: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
  currency: string;
  accommodationTypes: AccommodationTypeInfo[] | undefined;
  availabilityFor: (type: string) => { available: number } | undefined;
  priceFor: (type: AgcAccommodationType, isBishopRate: boolean) => number;
  bishopAmountLabel: string;
}) {
  const compact = variant === "edit";
  const availability = availabilityFor(draft.accommodationType);
  // The edit dialog releases the booking's own units before re-reserving, so
  // listed sold-out counts there must not block choosing a type.
  const soldOut = !compact && availability ? availability.available <= 0 : false;
  const typeLabel =
    accommodationTypes?.find((entry) => entry.type === draft.accommodationType)
      ?.label ??
    AGC_ACCOMMODATION_LABELS[draft.accommodationType] ??
    draft.accommodationType;
  const fullName = `${draft.firstName} ${draft.lastName}`.trim();

  const summary = (
    <>
      <span className="block truncate text-sm font-medium">
        {fullName || `Guest ${index + 1}`}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        {typeLabel}
        {draft.isBishopRate ? " · Bishop rate" : ""} ·{" "}
        <span className="tabular-nums">
          {formatMoney(
            priceFor(draft.accommodationType, draft.isBishopRate),
            currency,
          )}
        </span>
        /bed
      </span>
    </>
  );

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center gap-3 p-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground"
        >
          {index + 1}
        </span>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="min-w-0 flex-1 text-left"
          >
            {summary}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{summary}</div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Remove guest ${index + 1}`}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2Icon className="size-4" />
        </Button>
        {onToggle ? (
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform md:hidden",
              expanded && "rotate-180",
            )}
          />
        ) : null}
      </div>
      <div
        className={cn(
          "grid gap-3 border-t p-3 sm:grid-cols-2 sm:p-4",
          !compact && "lg:grid-cols-4",
          !expanded && "hidden md:grid",
        )}
      >
        <div className="space-y-1.5">
          <Label className={cn(compact && "text-xs")}>Title</Label>
          <Select
            value={draft.title}
            onValueChange={(value) => onChange({ title: value ?? draft.title })}
          >
            <SelectTrigger className={cn("w-full", compact && "h-9")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TITLE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className={cn(compact && "text-xs")}>
            First name
            {!draft.firstName.trim() && (
              <span className="text-destructive"> *</span>
            )}
          </Label>
          <Input
            className={cn(compact && "h-9")}
            value={draft.firstName}
            aria-invalid={!draft.firstName.trim()}
            onChange={(e) => onChange({ firstName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className={cn(compact && "text-xs")}>
            Last name
            {!draft.lastName.trim() && (
              <span className="text-destructive"> *</span>
            )}
          </Label>
          <Input
            className={cn(compact && "h-9")}
            value={draft.lastName}
            aria-invalid={!draft.lastName.trim()}
            onChange={(e) => onChange({ lastName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className={cn(compact && "text-xs")}>Gender</Label>
          <Select
            value={draft.gender}
            onValueChange={(value) =>
              onChange({
                gender: (value as "male" | "female") ?? draft.gender,
              })
            }
          >
            <SelectTrigger className={cn("w-full", compact && "h-9")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className={cn(compact && "text-xs")}>Accommodation</Label>
          <Select
            value={draft.accommodationType}
            items={accommodationTypes?.map((type) => ({
              value: type.type,
              label: type.label,
            }))}
            onValueChange={(value) => {
              const next = (value ??
                draft.accommodationType) as AgcAccommodationType;
              onChange({
                accommodationType: next,
                // Bishop rate is EBPV-only — keep the pair consistent.
                isBishopRate: next === "ebpv" ? draft.isBishopRate : false,
              });
            }}
          >
            <SelectTrigger className={cn("w-full", compact && "h-9")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accommodationTypes?.map((type) => {
                const typeAvailability = availabilityFor(type.type);
                const disabled =
                  !compact && typeAvailability
                    ? typeAvailability.available <= 0
                    : false;
                return (
                  <SelectItem
                    key={type.type}
                    value={type.type}
                    disabled={disabled}
                  >
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate">
                        {type.label}
                        {disabled ? " — sold out" : ""}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatMoney(
                          priceFor(type.type as AgcAccommodationType, false),
                          currency,
                        )}{" "}
                        / bed
                        {!compact && typeAvailability && !disabled
                          ? ` · ${typeAvailability.available} left`
                          : ""}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {soldOut && (
            <p className="text-xs text-destructive">
              This type is sold out — pick another for this guest.
            </p>
          )}
        </div>
        <label
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm sm:col-span-2",
            draft.accommodationType !== "ebpv" && "opacity-60",
          )}
          title={
            draft.accommodationType !== "ebpv"
              ? "Bishop rate applies to EBPV only"
              : undefined
          }
        >
          <Checkbox
            checked={draft.isBishopRate}
            disabled={draft.accommodationType !== "ebpv"}
            onCheckedChange={(checked) =>
              onChange({ isBishopRate: checked === true })
            }
          />
          <span className="font-medium">Bishop rate</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            +{bishopAmountLabel} · EBPV only
          </span>
        </label>
      </div>
    </div>
  );
}

/** Fixed live totals bar: capsule on mobile, floating panel on desktop. */
function SummaryBar({
  guestCount,
  summary,
  currency,
  capacityIssue,
  allDraftsValid,
  locked,
  loading,
  onReserve,
  onShowBreakdown,
}: {
  guestCount: number;
  summary: BookingSummary;
  currency: string;
  capacityIssue: string | null;
  allDraftsValid: boolean;
  locked: boolean;
  loading: boolean;
  onReserve: () => void;
  onShowBreakdown: () => void;
}) {
  const disabled = loading || locked || !allDraftsValid || Boolean(capacityIssue);
  const hint = capacityIssue
    ? null
    : !allDraftsValid
      ? "Fill in every guest's first and last name to continue."
      : locked
        ? "Booking is paused by the convention administrators."
        : null;

  return (
    <>
      {/* Mobile: capsule above the portal bottom nav. */}
      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] z-40 md:hidden">
        <div className="rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onShowBreakdown}
              className="min-w-0 text-left"
            >
              <span className="block truncate text-xs text-muted-foreground">
                {guestCount} guest{guestCount === 1 ? "" : "s"} ·{" "}
                {describeUnits(summary)}
              </span>
              <span className="block text-lg font-semibold tabular-nums">
                {formatMoney(summary.totalAmount, currency)}
              </span>
            </button>
            <Button
              type="button"
              onClick={onReserve}
              disabled={disabled}
              className="min-h-11 shrink-0"
            >
              {loading && <Loader2Icon className="size-4 animate-spin" />}
              Reserve &amp; hold
            </Button>
          </div>
          {capacityIssue ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />{" "}
              {capacityIssue}
            </p>
          ) : hint ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>

      {/* Desktop: floating totals panel. */}
      <div className="fixed right-6 bottom-6 z-40 hidden w-80 md:block">
        <div className="rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur">
          <p className="text-xs text-muted-foreground">
            {guestCount} guest{guestCount === 1 ? "" : "s"} ·{" "}
            {describeUnits(summary)}
          </p>
          <div className="mt-2 space-y-1">
            {summary.lines.map((line) => (
              <p
                key={`${line.accommodationType}-${line.isBishopRate}`}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {line.units} × {formatMoney(line.unitPrice, currency)}
                {line.isBishopRate ? " (bishop)" : ""} ={" "}
                {formatMoney(line.subtotal, currency)}
              </p>
            ))}
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(summary.totalAmount, currency)}
            </p>
          </div>
          {capacityIssue ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />{" "}
              {capacityIssue}
            </p>
          ) : hint ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
          <Button
            type="button"
            onClick={onReserve}
            disabled={disabled}
            className="mt-3 w-full"
          >
            {loading && <Loader2Icon className="size-4 animate-spin" />}
            Reserve &amp; hold
          </Button>
        </div>
      </div>
    </>
  );
}

/** Mobile-only per-line breakdown of the live summary. */
function BreakdownSheet({
  open,
  onOpenChange,
  guestCount,
  summary,
  currency,
  capacityIssue,
  allDraftsValid,
  locked,
  loading,
  onReserve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guestCount: number;
  summary: BookingSummary;
  currency: string;
  capacityIssue: string | null;
  allDraftsValid: boolean;
  locked: boolean;
  loading: boolean;
  onReserve: () => void;
}) {
  const disabled = loading || locked || !allDraftsValid || Boolean(capacityIssue);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0 md:hidden">
        <div
          className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted-foreground/30"
          aria-hidden
        />
        <SheetHeader className="border-b border-border bg-muted/30 px-4 py-3 text-left">
          <SheetTitle className="text-base">Booking summary</SheetTitle>
          <SheetDescription>
            {guestCount} guest{guestCount === 1 ? "" : "s"} — every bed priced
            for your region.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-4 py-4">
          {summary.lines.map((line) => (
            <div
              key={`${line.accommodationType}-${line.isBishopRate}`}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate">
                  {line.units} ×{" "}
                  {AGC_ACCOMMODATION_LABELS[line.accommodationType] ??
                    line.accommodationType}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(line.unitPrice, currency)} / bed
                  {line.isBishopRate ? " · bishop rate" : ""}
                </p>
              </div>
              <p className="shrink-0 tabular-nums">
                {formatMoney(line.subtotal, currency)}
              </p>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
            <p className="font-medium">Total</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMoney(summary.totalAmount, currency)}
            </p>
          </div>
          {capacityIssue ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />{" "}
              {capacityIssue}
            </p>
          ) : null}
        </div>
        <SheetFooter className="border-t border-border bg-muted/20 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            onClick={onReserve}
            disabled={disabled}
            className="min-h-11 w-full"
          >
            {loading && <Loader2Icon className="size-4 animate-spin" />}
            Reserve &amp; hold
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Booking card: same anatomy on every breakpoint. */
function BookingCard({
  booking,
  locked,
  loading,
  onPay,
  onEdit,
  onCancel,
  onDelete,
  onSubstitute,
  onIou,
  onEvidence,
}: {
  booking: RepBooking;
  locked: boolean;
  loading: boolean;
  onPay: (booking: RepBooking) => void;
  onEdit: (booking: RepBooking) => void;
  onCancel: (booking: RepBooking) => void;
  onDelete: (booking: RepBooking) => void;
  onSubstitute: (guest: RepBooking["guests"][number]) => void;
  onIou: (booking: RepBooking) => void;
  onEvidence: (booking: RepBooking) => void;
}) {
  const status = bookingStatusMeta(booking.bookingStatus);
  const payStatus = displayPaymentStatus(booking);
  const canPayOffline =
    !isClosedBooking(booking) &&
    booking.paymentMode === "offline" &&
    booking.bookingStatus === "reserved" &&
    (booking.paymentStatus === "awaiting_payment" ||
      booking.paymentStatus === "correction_requested");
  const canPayOnline =
    !isClosedBooking(booking) &&
    booking.paymentMode !== "offline" &&
    booking.bookingStatus === "reserved" &&
    booking.paymentStatus === "awaiting_payment";
  const isReserved = booking.bookingStatus === "reserved";
  const activeGuests = booking.guests.filter(
    (guest) => guest.status === "active",
  );

  return (
    <div className="flex flex-col rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-wider">
            {booking.referenceNumber || "(pending)"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Created{" "}
            {new Date(booking.createdAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {booking.paymentMode === "payment_on_arrival" && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Pay on arrival
            </Badge>
          )}
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
          <Badge variant="outline" className={payStatus.className}>
            {payStatus.label}
          </Badge>
          {isReserved && booking.expiresAt && booking.paymentMode !== "payment_on_arrival" ? (
            <HoldCountdown expiresAt={booking.expiresAt} />
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(booking.totalAmount, booking.currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          {activeGuests.length} guest{activeGuests.length === 1 ? "" : "s"} ·{" "}
          {booking.paymentMode === "payment_on_arrival"
            ? "pay on arrival"
            : booking.paymentMode === "offline"
              ? "offline"
              : "online"}
        </p>
      </div>

      {booking.adminMessage ? (
        <p className="mt-2 rounded-lg bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-300">
          {booking.adminMessage}
        </p>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {activeGuests.map((guest) => (
          <li key={guest._id} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                guestAvatarClass(guest),
              )}
            >
              {guestInitials(guest)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">
              {guest.title} {guest.firstName} {guest.lastName}
            </span>
            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
              {AGC_ACCOMMODATION_LABELS[
                guest.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
              ] ?? guest.accommodationType}
            </span>
            {guest.isBishopRate ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Bishop
              </Badge>
            ) : null}
            {isReserved ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto shrink-0 p-0 text-[11px]"
                onClick={() => onSubstitute(guest)}
              >
                Substitute
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {booking.paymentMode === "payment_on_arrival" && !isClosedBooking(booking) ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onIou(booking)}
            >
              <ReceiptTextIcon className="size-4" />{" "}
              {booking.poa?.status === "confirmed"
                ? "View paid receipt"
                : "View IOU receipt"}
            </Button>
            {booking.paymentStatus !== "confirmed" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => onEvidence(booking)}
              >
                <UploadIcon className="size-4" />{" "}
                {booking.poa?.status === "evidence_submitted"
                  ? "Replace evidence"
                  : "Upload payment evidence"}
              </Button>
            )}
          </>
        ) : null}
        {canPayOffline ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPay(booking)}
          >
            <ReceiptTextIcon className="size-4" /> Submit receipt
          </Button>
        ) : null}
        {canPayOnline ? (
          <Button type="button" size="sm" onClick={() => onPay(booking)}>
            Pay online
          </Button>
        ) : null}
        {isReserved ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More booking actions"
              className="ml-auto inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-2.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <EllipsisIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={loading} onClick={() => onEdit(booking)}>
                <PencilIcon /> Edit guests
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={loading}
                onClick={() => onCancel(booking)}
              >
                Cancel reservation
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={loading}
                onClick={() => onDelete(booking)}
              >
                <Trash2Icon /> Delete permanently
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {locked ? (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          Payment confirmed — this booking is locked. Contact the accommodation
          desk for any changes.
        </p>
      ) : null}
    </div>
  );
}

/** Per-booking payment dialog — its own state, so cards never leak values. */
function PaymentDialog({
  booking,
  bankDetails,
  onClose,
  onSubmitOffline,
  submitting,
}: {
  booking: RepBooking;
  bankDetails?: string;
  onClose: () => void;
  onSubmitOffline: (
    booking: RepBooking,
    data: {
      amountPaid: string;
      paymentRef: string;
      paymentDate: string;
      method: "bank_transfer" | "momo";
      receipt: File | null;
    },
  ) => void;
  submitting: boolean;
}) {
  const [amountPaid, setAmountPaid] = useState(() =>
    String(booking.offline?.amountPaid ?? booking.totalAmount),
  );
  const [paymentRef, setPaymentRef] = useState(
    booking.offline?.referenceNumber ?? "",
  );
  const [paymentDate, setPaymentDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [method] = useState<"bank_transfer" | "momo">("momo");
  const [receipt, setReceipt] = useState<File | null>(null);

  // Exact-amount rule: the entered amount must equal the system total.
  const amountMatches = amountsMatch(
    Number(amountPaid) || 0,
    booking.totalAmount,
  );
  const activeGuests = booking.guests.filter(
    (g) => g.status === "active",
  ).length;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Submit payment receipt"
      description={`Booking ${booking.referenceNumber} · ${formatMoney(booking.totalAmount, booking.currency)} · ${activeGuests} guest(s)`}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting || !receipt || !amountMatches}
            onClick={() =>
              onSubmitOffline(booking, {
                amountPaid,
                paymentRef,
                paymentDate,
                method,
                receipt,
              })
            }
          >
            {submitting && <Loader2Icon className="size-4 animate-spin" />}
            <ReceiptTextIcon className="size-4" /> Upload receipt
          </Button>
        </>
      }
    >
      <div className="space-y-3">
            {bankDetails && (
              <p className="rounded-lg bg-muted p-3 text-xs whitespace-pre-line">
                {bankDetails}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Amount paid ({booking.currency})</Label>
                <Input
                  type="number"
                  aria-invalid={!amountMatches ? true : undefined}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
                {!amountMatches && (
                  <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                    <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                    Rejected: you entered {booking.currency} {amountPaid || 0} but
                    this reservation costs exactly {booking.currency}{" "}
                    {booking.totalAmount}. Nothing less, nothing more.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Transaction reference</Label>
                <Input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Receipt (JPG, PNG or PDF)</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

    </ResponsiveDialog>
  );
}

/** Excel dry-run preview — same parser as the booking action, nothing booked. */
function ExcelPreviewDialog({
  preview,
  onClose,
  onConfirm,
  onReset,
  submitting,
}: {
  preview: ExcelPreview;
  onClose: () => void;
  onConfirm: () => void;
  onReset: () => void;
  submitting: boolean;
}) {
  if (preview.rows.length === 0) {
    return (
      <ResponsiveDialog
        open
        onOpenChange={(open) => !open && onClose()}
        title="No bookable guests found"
        description="The file has no valid guest rows. Fix the problems below and upload again."
        footer={
          <Button type="button" variant="outline" onClick={onReset}>
            Choose another file
          </Button>
        }
      >
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
          {preview.errors.map((error) => (
            <li key={error}>• {error}</li>
          ))}
        </ul>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Review your sheet"
      description={
        <>
            {preview.rows.length} guest{preview.rows.length === 1 ? "" : "s"}{" "}
            ready to book.
            {preview.errors.length > 0 &&
              ` ${preview.errors.length} row${preview.errors.length === 1 ? "" : "s"} will be skipped (listed below).`}
        </>
      }
      contentClassName="sm:max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onReset}>
            Choose another file
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2Icon className="size-4 animate-spin" />}
            Confirm &amp; book {preview.rows.length} guest
            {preview.rows.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="max-h-72 overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Row</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Accommodation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row) => (
                <TableRow key={row.rowNumber}>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.rowNumber}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.title} {row.firstName} {row.lastName}
                    {row.isBishopRate && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Bishop rate
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{row.gender}</TableCell>
                  <TableCell className="text-sm">
                    {AGC_ACCOMMODATION_LABELS[
                      row.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
                    ] ?? row.accommodationType}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {preview.errors.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertTriangleIcon className="size-3.5" />
              {preview.errors.length} row{preview.errors.length === 1 ? "" : "s"}{" "}
              will be skipped
            </p>
            <ul className="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-xs text-destructive">
              {preview.errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

    </ResponsiveDialog>
  );
}

export function RepAccommodationTab() {
  const { sessionToken, handleSessionError } = useRepSession();
  const overview = useQuery(
    api.agcBookings.getAccommodationOverview,
    sessionToken ? { sessionToken } : "skip",
  ) as AccommodationOverview | undefined;
  const bookings = useQuery(
    api.agcBookings.listRepBookings,
    sessionToken ? { sessionToken } : "skip",
  ) as RepBooking[] | undefined;

  const createBooking = useMutation(api.agcBookings.createBooking);
  const cancelBooking = useMutation(api.agcBookings.cancelBooking);
  const editBooking = useMutation(api.agcBookings.editBooking);
  const deleteBooking = useMutation(api.agcBookings.deleteBooking);
  const submitOffline = useMutation(api.agcBookings.submitOfflineBookingPayment);
  const substitute = useMutation(api.agcBookings.substituteGuest);
  const generateUploadUrl = useMutation(api.agcPortal.generateReceiptUploadUrl);
  const submitPoaEvidence = useMutation(api.agcPoa.submitPoaEvidence);
  // Payment-on-arrival (hub-enrolled): book now, pay on arrival, IOU receipt.
  const [usePoa, setUsePoa] = useState(false);
  const [poaIouTarget, setPoaIouTarget] = useState<{
    kind: "registration" | "booking";
    recordId: string;
  } | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<string | null>(null);
  const [poaBusy, setPoaBusy] = useState(false);
  const iouDoc = useQuery(
    api.agcPoa.getPoaIou,
    poaIouTarget && sessionToken
      ? {
          sessionToken,
          kind: poaIouTarget.kind,
          recordId: poaIouTarget.recordId,
        }
      : "skip",
  );
  const downloadTemplate = useAction(api.agcExcel.downloadBookingTemplate);
  const createFromExcel = useAction(api.agcExcel.createBookingFromExcel);
  const previewExcelAction = useAction(api.agcExcel.previewBookingExcel);
  const exportBookings = useAction(api.agcExcel.exportRepBookingsExcel);

  const portalConfig = useQuery(api.agcPortal.getPortalConfig);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastBooking, setLastBooking] = useState<{
    bookingId: string;
    referenceNumber: string;
    totalAmount: number;
    currency: string;
    expiresAt: number | null;
  } | null>(null);

  // Payment dialog (per-booking; null = closed)
  const [payTarget, setPayTarget] = useState<RepBooking | null>(null);

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<RepBooking | null>(null);

  // Edit dialog (reserved bookings only): drafts mirror the create form
  const [editTarget, setEditTarget] = useState<RepBooking | null>(null);
  const [editDrafts, setEditDrafts] = useState<Draft[]>([]);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RepBooking | null>(null);

  // Substitution dialog
  const [subTarget, setSubTarget] = useState<RepBooking["guests"][number] | null>(
    null,
  );
  const [subFirst, setSubFirst] = useState("");
  const [subLast, setSubLast] = useState("");
  const [subGender, setSubGender] = useState<"male" | "female">("male");
  const [subTitle, setSubTitle] = useState("");

  // Bookings list filters
  const [filter, setFilter] = useState<BookingFilter>("all");
  const [search, setSearch] = useState("");

  // Desktop view mode: comfy cards or dense table (mobile is always cards).
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Quick-scan guest roster (collapsed by default; it can be long).
  const [rosterOpen, setRosterOpen] = useState(false);
  const rosterRows = useMemo(
    () => guestRosterRows(bookings ?? []),
    [bookings],
  );

  // Mobile: split the tab into two views so phones never scroll past a long
  // builder to reach an existing booking.
  const [mobileView, setMobileView] = useState<"book" | "bookings">("book");
  // Mobile guest rows collapse to a summary; newly added guests auto-expand.
  const [expandedGuest, setExpandedGuest] = useState<number | null>(null);
  // Mobile-only per-line breakdown sheet.
  const [reviewOpen, setReviewOpen] = useState(false);
  const builderRef = useRef<HTMLDivElement>(null);

  // Excel flow
  const [excelFileName, setExcelFileName] = useState("");
  const [excelStorageId, setExcelStorageId] = useState<Id<"_storage"> | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const isOffline = overview ? overview.isGhsRegion : true;
  const currency = overview?.currency ?? "GHS";
  const region: AgcRegion = overview?.region ?? "ghana";

  // Live pricing config from the server overview so pre-submit totals reflect
  // admin-edited prices (falls back to catalog defaults while it loads).
  const liveTypes = useMemo(
    () =>
      overview
        ? typesConfigFromOverview(overview.accommodationTypes)
        : AGC_ACCOMMODATION_TYPES,
    [overview],
  );
  const liveBishop = overview?.bishopRate ?? AGC_BISHOP_RATE;

  const summary = useMemo(
    () => computeBookingSummary(drafts, region, liveTypes, liveBishop),
    [drafts, region, liveTypes, liveBishop],
  );
  const capacityIssue = useMemo(
    () => (overview ? capacityProblem(summary, overview.availability, liveTypes) : null),
    [summary, overview, liveTypes],
  );
  const allDraftsValid = drafts.length > 0 && drafts.every(draftIsValid);

  /** Live per-bed price for a draft (bishop rate applies to EBPV only). */
  const priceFor = (type: AgcAccommodationType, isBishopRate: boolean) => {
    if (isBishopRate && type === "ebpv") {
      return isOffline ? liveBishop.ghs : liveBishop.usd;
    }
    const config = liveTypes[type] ?? AGC_ACCOMMODATION_TYPES[type];
    return isOffline ? config.pricing.ghs : config.pricing.usd;
  };
  const bishopAmountLabel = formatMoney(
    isOffline ? liveBishop.ghs : liveBishop.usd,
    currency,
  );

  const availabilityFor = (type: string) =>
    overview?.availability.find((row) => row.accommodationType === type);

  const addDraft = () => {
    setExpandedGuest(drafts.length);
    setDrafts((prev) => [...prev, emptyDraft()]);
  };

  const updateDraft = (index: number, patch: Partial<Draft>) =>
    setDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );

  const removeDraft = (index: number) => {
    setExpandedGuest((current) => {
      if (current === null) return current;
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateBooking = async () => {
    if (!sessionToken || drafts.length === 0) return;
    if (capacityIssue) {
      setError(capacityIssue);
      toast.error("Not enough capacity", { description: capacityIssue });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await createBooking({
        sessionToken,
        guests: drafts.map((draft) => ({
          firstName: draft.firstName,
          lastName: draft.lastName,
          gender: draft.gender,
          title: draft.title || "Member",
          accommodationType: draft.accommodationType,
          isBishopRate: draft.isBishopRate,
        })),
        paymentOnArrival: usePoa || undefined,
      });
      setLastBooking({
        bookingId: result.bookingId,
        referenceNumber: result.referenceNumber,
        totalAmount: result.totalAmount,
        currency: result.currency,
        expiresAt: result.expiresAt ?? null,
      });
      setDrafts([]);
      setExpandedGuest(null);
      if (result.paymentOnArrival) {
        setPoaIouTarget({ kind: "booking", recordId: result.bookingId });
        toast.success(
          `Booking ${result.referenceNumber} created on payment-on-arrival terms — IOU receipt generated. Your beds are held until payment is confirmed at the venue desk.`,
        );
      } else if (result.expiresAt) {
        toast.success(
          `Reservation held until ${new Date(result.expiresAt).toLocaleString()}`,
        );
      }
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitOffline = async (
    booking: RepBooking,
    data: {
      amountPaid: string;
      paymentRef: string;
      paymentDate: string;
      method: "bank_transfer" | "momo";
      receipt: File | null;
    },
  ) => {
    if (!sessionToken || !data.receipt) {
      toast.error("Attach a scan or photo of your payment receipt (JPG, PNG or PDF).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Photos are compressed client-side; PDFs pass through unchanged.
      const { file: uploadFile } = await compressImageForUpload(data.receipt);
      const storageId = await uploadFileToConvex(uploadFile, () =>
        generateUploadUrl({ sessionToken }),
      );
      await submitOffline({
        sessionToken,
        bookingId: booking._id as Id<"agcBookings">,
        offline: {
          amountPaid: Number(data.amountPaid) || 0,
          referenceNumber: data.paymentRef,
          paymentDate: data.paymentDate,
          method: data.method,
          receiptStorageId: storageId,
          receiptFileName: uploadFile.name,
          receiptContentType: uploadFile.type || undefined,
        },
      });
      setPayTarget(null);
      toast.success("Receipt submitted — finance will review it.");
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelConfirmed = async () => {
    if (!sessionToken || !cancelTarget) return;
    setLoading(true);
    try {
      await cancelBooking({
        sessionToken,
        bookingId: cancelTarget._id as Id<"agcBookings">,
      });
      toast.success("Reservation cancelled — the held beds are back in the pool.");
      setCancelTarget(null);
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (booking: RepBooking) => {
    setEditTarget(booking);
    setEditDrafts(
      booking.guests
        .filter((guest) => guest.status === "active")
        .map((guest) => ({
          firstName: guest.firstName,
          lastName: guest.lastName,
          gender: guest.gender === "female" ? "female" : "male",
          title: guest.title,
          accommodationType: (guest.accommodationType as Draft["accommodationType"]) ?? "dormitory",
          isBishopRate: guest.isBishopRate,
        })),
    );
  };

  const editSummary = useMemo(
    () => computeBookingSummary(editDrafts, region, liveTypes, liveBishop),
    [editDrafts, region, liveTypes, liveBishop],
  );
  const editCapacityIssue = useMemo(() => {
    // The edit releases the booking's current units before re-reserving, so
    // effective availability = listed availability + this booking's held units.
    if (!overview || !editTarget) return null;
    const held = new Map<string, number>();
    for (const line of editTarget.lines) {
      held.set(line.accommodationType, (held.get(line.accommodationType) ?? 0) + line.quantity);
    }
    return capacityProblem(
      editSummary,
      overview.availability.map((row) => ({
        accommodationType: row.accommodationType,
        available: row.available + (held.get(row.accommodationType) ?? 0),
      })),
      liveTypes,
    );
  }, [editSummary, overview, editTarget, liveTypes]);
  const editAllValid = editDrafts.length > 0 && editDrafts.every(draftIsValid);

  const handleEditSave = async () => {
    if (!sessionToken || !editTarget) return;
    if (editCapacityIssue) {
      toast.error("Not enough capacity", { description: editCapacityIssue });
      return;
    }
    setLoading(true);
    setError("");
    try {
      await editBooking({
        sessionToken,
        bookingId: editTarget._id as Id<"agcBookings">,
        guests: editDrafts.map((draft) => ({
          firstName: draft.firstName,
          lastName: draft.lastName,
          gender: draft.gender,
          title: draft.title || "Member",
          accommodationType: draft.accommodationType,
          isBishopRate: draft.isBishopRate,
        })),
      });
      toast.success(`Reservation ${editTarget.referenceNumber} updated.`);
      setEditTarget(null);
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!sessionToken || !deleteTarget) return;
    setLoading(true);
    try {
      await deleteBooking({
        sessionToken,
        bookingId: deleteTarget._id as Id<"agcBookings">,
      });
      toast.success(`Reservation ${deleteTarget.referenceNumber} deleted — beds returned to the pool.`);
      setDeleteTarget(null);
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!sessionToken) return;
    try {
      const result = await downloadTemplate({ sessionToken });
      const binary = atob(result.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
    }
  };

  const handleDownloadExcel = async () => {
    if (!sessionToken) return;
    setExporting(true);
    try {
      const result = await exportBookings({ sessionToken });
      downloadBase64File(result.filename, result.contentBase64);
      toast.success(`Downloaded ${result.filename}`);
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setExporting(false);
    }
  };

  const resetExcel = () => {
    setExcelPreview(null);
    setExcelStorageId(null);
    setExcelFileName("");
    if (excelInputRef.current) excelInputRef.current.value = "";
  };

  const handleExcelSelect = async (file: File | null) => {
    if (!sessionToken || !file) return;
    setLoading(true);
    setError("");
    try {
      const storageId = await uploadFileToConvex(file, () =>
        generateUploadUrl({ sessionToken }),
      );
      const result = await previewExcelAction({
        sessionToken,
        storageId,
      });
      setExcelStorageId(storageId);
      setExcelFileName(file.name);
      setExcelPreview(result);
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
      resetExcel();
    } finally {
      setLoading(false);
    }
  };

  const handleExcelConfirm = async () => {
    if (!sessionToken || !excelStorageId) return;
    setLoading(true);
    setError("");
    try {
      const result = await createFromExcel({
        sessionToken,
        storageId: excelStorageId as Id<"_storage">,
        paymentOnArrival: usePoa || undefined,
      });
      setLastBooking({
        bookingId: result.bookingId,
        referenceNumber: result.referenceNumber,
        totalAmount: result.totalAmount,
        currency: result.currency,
        expiresAt: Date.now() + (overview?.holdHours ?? 72) * 3_600_000,
      });
      resetExcel();
      toast.success(
        `Booked ${result.guestCount} guest(s) from Excel (${result.referenceNumber}).`,
      );
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  /** Upload POA payment evidence for a booking (IOU stays until confirmed). */
  const handlePoaEvidence = async (file: File, note: string) => {
    if (!sessionToken || !evidenceTarget) return;
    setPoaBusy(true);
    try {
      const { file: uploadFile } = await compressImageForUpload(file);
      const storageId = await uploadFileToConvex(uploadFile, () =>
        generateUploadUrl({ sessionToken }),
      );
      await submitPoaEvidence({
        sessionToken,
        kind: "booking",
        recordId: evidenceTarget,
        evidence: {
          storageId,
          fileName: uploadFile.name,
          contentType: uploadFile.type || undefined,
          note: note.trim() || undefined,
        },
      });
      setEvidenceTarget(null);
      toast.success(
        "Payment evidence uploaded — the accommodation desk will confirm your payment.",
      );
    } catch (err) {
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setPoaBusy(false);
    }
  };

  const openSubstitution = (guest: RepBooking["guests"][number]) => {
    setSubTarget(guest);
    setSubFirst("");
    setSubLast("");
    setSubGender(guest.gender === "female" ? "female" : "male");
    setSubTitle(guest.title);
  };

  const handleSubstitution = async () => {
    if (!sessionToken || !subTarget) return;
    setLoading(true);
    setError("");
    try {
      await substitute({
        sessionToken,
        guestId: subTarget._id as Id<"agcGuests">,
        firstName: subFirst,
        lastName: subLast,
        gender: subGender,
        title: subTitle,
      });
      toast.success("Guest substituted — history preserved.");
      setSubTarget(null);
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = useMemo(() => {
    const all = bookings ?? [];
    const term = search.trim().toLowerCase();
    return all.filter(
      (booking) =>
        bookingMatchesFilter(booking, filter) &&
        (!term ||
          booking.referenceNumber.toLowerCase().includes(term) ||
          booking.guests.some((guest) =>
            `${guest.firstName} ${guest.lastName}`.toLowerCase().includes(term),
          )),
    );
  }, [bookings, filter, search]);

  const bookingCounts = useMemo(() => {
    const all = bookings ?? [];
    return {
      all: all.length,
      active: all.filter((booking) => bookingMatchesFilter(booking, "active"))
        .length,
      awaiting: all.filter((booking) =>
        bookingMatchesFilter(booking, "awaiting"),
      ).length,
      closed: all.filter((booking) => bookingMatchesFilter(booking, "closed"))
        .length,
    };
  }, [bookings]);

  /** Empty-state CTA: jump to the builder with a fresh guest row. */
  const startBooking = () => {
    addDraft();
    setMobileView("book");
    builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /** Payment confirmed → the booking is locked: no edit/cancel/delete/substitute. */
  const isLockedBooking = (booking: RepBooking) =>
    booking.bookingStatus === "confirmed";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {portalConfig?.locked && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle>Accommodation booking is paused</AlertTitle>
          <AlertDescription>
            The convention administrators have temporarily locked new
            bookings. Existing reservations and receipts are unaffected —
            please check back later.
          </AlertDescription>
        </Alert>
      )}

      {/* Mobile: split the tab into two views so phones never scroll past a
          long builder to reach an existing booking. */}
      <Tabs
        value={mobileView}
        onValueChange={(value) => {
          const next = value as "book" | "bookings";
          setMobileView(next);
          window.scrollTo({ top: 0, behavior: "auto" });
        }}
        className="md:hidden"
      >
        <TabsList className="w-full">
          <TabsTrigger value="book">New booking</TabsTrigger>
          <TabsTrigger value="bookings">
            Your bookings
            {bookings && bookings.length > 0 ? ` (${bookings.length})` : ""}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Availability & deadline */}
      <section
        className={cn("space-y-3", mobileView !== "book" && "hidden md:block")}
        aria-label="Availability"
      >
        <Card>
          <CardHeader>
            <ZoneHeader
              icon={BedDoubleIcon}
              title="Availability & deadline"
              description="Live bed counts for the pools your hub draws from — one bed per guest."
            />
          </CardHeader>
          <CardContent>
            {overview === undefined && sessionToken ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-3 rounded-xl border p-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))}
              </div>
            ) : overview ? (
              <CapacityBoard
                rows={overview.availability}
                types={overview.accommodationTypes}
                currency={currency}
                isOffline={isOffline}
                deadline={overview.deadline}
                holdHours={overview.holdHours}
              />
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* New reservation */}
      <section
        ref={builderRef}
        className={cn("scroll-mt-24", mobileView !== "book" && "hidden md:block")}
        aria-label="New reservation"
      >
        <Card>
          <CardHeader>
            <ZoneHeader
              icon={UserPlusIcon}
              title="New reservation"
              badge={
                drafts.length > 0
                  ? `${drafts.length} guest${drafts.length === 1 ? "" : "s"}`
                  : undefined
              }
              description="Add guests one by one. Every option is priced per bed — one bed per guest."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {drafts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No guests added yet. Click “Add guest” to start.
              </p>
            )}

            {drafts.map((draft, index) => (
              <GuestRowEditor
                key={index}
                draft={draft}
                index={index}
                expanded={expandedGuest === index}
                onToggle={() =>
                  setExpandedGuest(expandedGuest === index ? null : index)
                }
                onChange={(patch) => updateDraft(index, patch)}
                onRemove={() => removeDraft(index)}
                currency={currency}
                accommodationTypes={overview?.accommodationTypes}
                availabilityFor={availabilityFor}
                priceFor={priceFor}
                bishopAmountLabel={bishopAmountLabel}
              />
            ))}


            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={addDraft}
                className="w-full border-dashed sm:w-auto"
              >
                + Add guest
              </Button>
              {drafts.length > 0 && !allDraftsValid && (
                <p className="self-center text-xs text-muted-foreground">
                  Fill in every guest&apos;s first and last name to continue.
                </p>
              )}
            </div>

            {/* Bulk import — secondary path, still previews before booking. */}
            <div className="rounded-xl border border-dashed bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Bulk import from Excel</p>
                    <p className="truncate text-xs text-muted-foreground">
                      We preview the file first — nothing is booked until you confirm.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDownloadTemplate()}
                  >
                    Download template
                  </Button>
                  <Input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xlsm"
                    aria-label="Choose an Excel file"
                    className="w-full text-xs sm:w-56"
                    onChange={(e) => void handleExcelSelect(e.target.files?.[0] ?? null)}
                  />
                  {excelPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetExcel}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              {excelPreview && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {excelFileName}: {excelPreview.rows.length} valid row(s)
                  {excelPreview.errors.length > 0 &&
                    `, ${excelPreview.errors.length} with problems`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Guest roster — every name, gender, room type and payment status in one flat list. */}
      {rosterRows.length > 0 && (
        <section
          className={cn(mobileView !== "bookings" && "hidden md:block")}
          aria-label="Guest roster"
        >
        <Card>
          <CardHeader>
            <ZoneHeader
              icon={UsersIcon}
              title="Guest roster"
              badge={rosterRows.length}
              description="Every guest across all bookings — payment status follows the parent booking."
              right={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRosterOpen((open) => !open)}
                  aria-expanded={rosterOpen}
                >
                  {rosterOpen ? "Hide guests" : "Show guests"}
                  <ChevronDownIcon
                    className={`size-4 transition-transform ${rosterOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              }
            />
          </CardHeader>
          {rosterOpen && (
            <CardContent>
              {/* Mobile: compact cards. */}
              <ul className="space-y-2 md:hidden">
                {rosterRows.map((row) => {
                  const pay = displayPaymentStatus(row.booking);
                  return (
                    <li
                      key={row.key}
                      className="flex items-center gap-3 rounded-lg border p-2.5"
                    >
                      <span
                        aria-hidden
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${guestAvatarClass(row.guest)}`}
                      >
                        {guestInitials(row.guest)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {row.guest.title} {row.guest.firstName} {row.guest.lastName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.guest.gender} · {AGC_ACCOMMODATION_LABELS[
                            row.guest.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
                          ] ?? row.guest.accommodationType}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className={pay.className}>
                          {pay.label}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {row.booking.referenceNumber || "(pending)"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: dense zebra table with avatar chips. */}
              <div className="hidden max-h-[60vh] overflow-auto rounded-xl ring-1 ring-foreground/10 md:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_theme(colors.border)]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 pl-3 text-xs">#</TableHead>
                      <TableHead className="text-xs">Guest</TableHead>
                      <TableHead className="text-xs">Gender</TableHead>
                      <TableHead className="text-xs">Room type</TableHead>
                      <TableHead className="text-xs">Booking</TableHead>
                      <TableHead className="pr-3 text-xs">Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rosterRows.map((row, index) => {
                      const pay = displayPaymentStatus(row.booking);
                      return (
                        <TableRow key={row.key} className="odd:bg-muted/40 hover:bg-muted/60">
                          <TableCell className="pl-3 text-xs tabular-nums text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <span
                                aria-hidden
                                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${guestAvatarClass(row.guest)}`}
                              >
                                {guestInitials(row.guest)}
                              </span>
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium">
                                  <span className="truncate">
                                    {row.guest.title} {row.guest.firstName} {row.guest.lastName}
                                  </span>
                                  {row.guest.isBishopRate && (
                                    <Badge variant="outline" className="shrink-0 text-[10px]">
                                      Bishop rate
                                    </Badge>
                                  )}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm capitalize text-muted-foreground">
                            {row.guest.gender}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {AGC_ACCOMMODATION_LABELS[
                              row.guest.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
                            ] ?? row.guest.accommodationType}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {row.booking.referenceNumber || "(pending)"}
                          </TableCell>
                          <TableCell className="pr-3">
                            <Badge variant="outline" className={pay.className}>
                              {pay.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
        </section>
      )}

      {/* Your bookings */}
      <section
        className={cn(mobileView !== "bookings" && "hidden md:block")}
        aria-label="Your bookings"
      >
      <Card>
        <CardHeader>
          <ZoneHeader
            icon={ClipboardListIcon}
            title="Your bookings"
            badge={bookings && bookings.length > 0 ? bookings.length : undefined}
            description="Pay, edit or cancel before the hold expires."
            right={
              (bookings?.length ?? 0) > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  onClick={() => void handleDownloadExcel()}
                >
                  {exporting ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <DownloadIcon className="size-4" />
                  )}
                  Excel report
                </Button>
              ) : undefined
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {(bookings?.length ?? 0) > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {BOOKING_FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={filter === option.value ? "default" : "outline"}
                    className="rounded-full"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                    <span className="text-[11px] tabular-nums opacity-70">
                      {bookingCounts[option.value]}
                    </span>
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                  <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Reference or guest name…"
                    className="h-9 w-full pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {/* Desktop only — mobile always uses cards. */}
                <ToggleGroup
                  value={[viewMode]}
                  onValueChange={(value) => {
                    const next = value[0] as "cards" | "table" | undefined;
                    if (next === "cards" || next === "table") setViewMode(next);
                  }}
                  variant="outline"
                  size="sm"
                  className="ml-auto hidden md:inline-flex"
                  aria-label="Toggle bookings view"
                >
                  <ToggleGroupItem value="cards" aria-label="Card view">
                    <LayoutGridIcon className="size-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="table" aria-label="Table view">
                    <TableIcon className="size-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          ) : null}
          {lastBooking && (
            <Alert>
              <AlertTitle>
                Reservation {lastBooking.referenceNumber} created
              </AlertTitle>
              <AlertDescription>
                {lastBooking.currency} {lastBooking.totalAmount} —{" "}
                {lastBooking.expiresAt ? (
                  <>
                    held until {new Date(lastBooking.expiresAt).toLocaleString()}. Pay by
                    bank transfer/MoMo and submit your receipt on the booking
                    below.
                  </>
                ) : (
                  <>held on payment-on-arrival terms — no expiry. Pay at the
                    venue desk during check-in (bank transfer/MoMo receipts can
                    still be submitted on the booking below).</>
                )}
              </AlertDescription>
            </Alert>
          )}

          {bookings === undefined && sessionToken ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : (bookings ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm">
              <p className="font-medium">How booking works</p>
              <ol className="mt-4 space-y-3">
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    1
                  </span>
                  <div>
                    <p className="font-medium">Add guests and reserve</p>
                    <p className="text-muted-foreground">
                      Beds are held for {overview?.holdHours ?? 72}h while you
                      pay.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    2
                  </span>
                  <div>
                    <p className="font-medium">Pay and upload your receipt</p>
                    <p className="text-muted-foreground">
                      Bank transfer or MoMo, then submit the receipt on the
                      booking.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    3
                  </span>
                  <div>
                    <p className="font-medium">Finance confirms</p>
                    <p className="text-muted-foreground">
                      Your booking is locked in and the beds are guaranteed.
                    </p>
                  </div>
                </li>
              </ol>
              <Button type="button" className="mt-4" onClick={startBooking}>
                Add your first guest
              </Button>
              {overview?.accommodationBankDetails && (
                <details className="mt-4 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Payment details
                  </summary>
                  <p className="mt-2 rounded bg-muted p-3 whitespace-pre-line">
                    {overview.accommodationBankDetails}
                  </p>
                </details>
              )}
            </div>
          ) : filteredBookings.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No bookings match this filter.
            </p>
          ) : (
            <>
              {/* Desktop table view (toggle in the header) */}
              {viewMode === "table" && (
                <div className="hidden overflow-x-auto rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Guests</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Hold expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map((booking) => {
                        const status = bookingStatusMeta(booking.bookingStatus);
                        const payStatus = displayPaymentStatus(booking);
                        const canPay =
                          !isClosedBooking(booking) &&
                          booking.bookingStatus === "reserved" &&
                          ((booking.paymentMode === "offline" &&
                            (booking.paymentStatus === "awaiting_payment" ||
                              booking.paymentStatus === "correction_requested")) ||
                            (booking.paymentMode !== "offline" &&
                              booking.paymentStatus === "awaiting_payment"));
                        return (
                          <TableRow key={booking._id}>
                            <TableCell className="font-mono text-xs">
                              {booking.referenceNumber || "(pending)"}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {booking.guests.filter((g) => g.status === "active").length}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {booking.currency} {booking.totalAmount}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={status.className}>
                                {status.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={payStatus.className}>
                                {payStatus.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                              {booking.bookingStatus === "reserved" && booking.expiresAt && booking.paymentMode !== "payment_on_arrival"
                                ? new Date(booking.expiresAt).toLocaleString()
                                : booking.bookingStatus === "reserved" && booking.paymentMode === "payment_on_arrival"
                                  ? "Held for desk check-in"
                                  : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {canPay ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setPayTarget(booking)}
                                >
                                  {booking.paymentMode === "offline" ? "Receipt" : "Pay"}
                                </Button>
                              ) : booking.bookingStatus === "reserved" ? (
                                <div className="flex justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEdit(booking)}
                                    disabled={loading}
                                    aria-label="Edit reservation"
                                  >
                                    <PencilIcon className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteTarget(booking)}
                                    disabled={loading}
                                    aria-label="Delete reservation"
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2Icon className="size-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {booking.bookingStatus === "confirmed" ? "Locked" : "—"}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div
                className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3${
                  viewMode === "table" ? " md:hidden" : ""
                }`}
              >
            {filteredBookings.map((booking) => (
              <BookingCard
                key={booking._id}
                booking={booking}
                locked={isLockedBooking(booking)}
                loading={loading}
                onPay={setPayTarget}
                onEdit={openEdit}
                onCancel={setCancelTarget}
                onDelete={setDeleteTarget}
                onSubstitute={openSubstitution}
                onIou={(target) =>
                  setPoaIouTarget({ kind: "booking", recordId: target._id })
                }
                onEvidence={(target) => setEvidenceTarget(target._id)}
              />
            ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </section>

      {/* Payment-on-arrival toggle (hubs enrolled by the admin) */}
      {overview?.paymentOnArrival && drafts.length > 0 && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <input
            type="checkbox"
            checked={usePoa}
            onChange={(e) => setUsePoa(e.target.checked)}
            className="mt-0.5 size-4 accent-amber-600"
          />
          <span>
            <span className="font-semibold text-amber-900 dark:text-amber-200">
              Book without paying — payment on arrival
            </span>
            <span className="mt-0.5 block text-xs text-amber-800/90 dark:text-amber-300/90">
              Your hub is enrolled: reserve these beds now, pay on arrival, and
              upload your payment evidence here when you pay. An IOU receipt is
              generated automatically; the total is only credited once the desk
              confirms your payment. Applies to the Excel flow too.
            </span>
          </span>
        </label>
      )}

      {/* Room for the fixed summary bar so content never hides behind it. */}
      {drafts.length > 0 && <div className="h-36 md:h-40" aria-hidden />}

      {drafts.length > 0 && (
        <SummaryBar
          guestCount={drafts.length}
          summary={summary}
          currency={currency}
          capacityIssue={capacityIssue}
          allDraftsValid={allDraftsValid}
          locked={portalConfig?.locked === true}
          loading={loading}
          onReserve={() => void handleCreateBooking()}
          onShowBreakdown={() => setReviewOpen(true)}
        />
      )}
      <BreakdownSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        guestCount={drafts.length}
        summary={summary}
        currency={currency}
        capacityIssue={capacityIssue}
        allDraftsValid={allDraftsValid}
        locked={portalConfig?.locked === true}
        loading={loading}
        onReserve={() => {
          setReviewOpen(false);
          void handleCreateBooking();
        }}
      />

      {/* Payment dialog */}
      {payTarget && (
        <PaymentDialog
          booking={payTarget}
          bankDetails={overview?.accommodationBankDetails}
          onClose={() => setPayTarget(null)}
          onSubmitOffline={(target, data) => void handleSubmitOffline(target, data)}
          submitting={loading}
        />
      )}

      {/* Payment-on-arrival: IOU / paid receipt + evidence upload */}
      <PoaIouDialog doc={iouDoc ?? null} onClose={() => setPoaIouTarget(null)} />
      <PoaEvidenceDialog
        open={!!evidenceTarget}
        submitting={poaBusy}
        onClose={() => setEvidenceTarget(null)}
        onSubmit={(file, note) => void handlePoaEvidence(file, note)}
      />

      {/* Excel preview dialog */}
      {excelPreview && (
        <ExcelPreviewDialog
          preview={excelPreview}
          onClose={resetExcel}
          onReset={resetExcel}
          onConfirm={() => void handleExcelConfirm()}
          submitting={loading || portalConfig?.locked === true}
        />
      )}

      {/* Cancel confirmation */}
      <ResponsiveDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this reservation?"
        description={`${cancelTarget?.referenceNumber ?? ""} — cancelling releases the held beds back to the pool immediately. Other hubs can take them. You would need to book again if space remains.`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
            >
              Keep reservation
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleCancelConfirmed()}
              disabled={loading}
            >
              {loading && <Loader2Icon className="size-4 animate-spin" />}
              Cancel reservation
            </Button>
          </>
        }
      />

      {/* Edit reservation dialog (reserved bookings only) */}
      <ResponsiveDialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
        title={`Edit reservation ${editTarget?.referenceNumber ?? ""}`}
        description={`The hold is released and re-reserved with your changes — if a bed type sells out meanwhile, saving fails and nothing changes. New total: ${formatMoney(editSummary.totalAmount, currency)} (${describeUnits(editSummary)}).`}
        contentClassName="sm:max-w-2xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleEditSave()}
              disabled={loading || !editAllValid || Boolean(editCapacityIssue)}
            >
              {loading && <Loader2Icon className="size-4 animate-spin" />}
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {editDrafts.map((draft, index) => (
            <GuestRowEditor
              key={index}
              draft={draft}
              index={index}
              variant="edit"
              expanded
              onChange={(patch) =>
                setEditDrafts((prev) =>
                  prev.map((entry, i) =>
                    i === index ? { ...entry, ...patch } : entry,
                  ),
                )
              }
              onRemove={() =>
                setEditDrafts((prev) => prev.filter((_, i) => i !== index))
              }
              currency={currency}
              accommodationTypes={overview?.accommodationTypes}
              availabilityFor={availabilityFor}
              priceFor={priceFor}
              bishopAmountLabel={bishopAmountLabel}
            />
          ))}

          {editDrafts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No guests left — add one or delete the reservation instead.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditDrafts((prev) => [...prev, emptyDraft()])}
          >
            + Add guest
          </Button>
          {editCapacityIssue && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <AlertTriangleIcon className="size-3.5" /> {editCapacityIssue}
            </p>
          )}
        </div>
      </ResponsiveDialog>

      {/* Delete confirmation */}
      <ResponsiveDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this reservation?"
        description={`${deleteTarget?.referenceNumber ?? ""} will be permanently removed — guests, payment lines, and the hold itself. The beds return to the pool immediately. This cannot be undone; use Cancel instead if you want a record kept.`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Keep reservation
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteConfirmed()}
              disabled={loading}
            >
              {loading && <Loader2Icon className="size-4 animate-spin" />}
              Delete permanently
            </Button>
          </>
        }
      />

      {/* Substitution dialog */}
      <ResponsiveDialog
        open={subTarget !== null}
        onOpenChange={(open) => !open && setSubTarget(null)}
        title="Substitute guest"
        description={`Replacing ${subTarget?.title ?? ""} ${subTarget?.firstName ?? ""} ${subTarget?.lastName ?? ""}. Same gender and accommodation type required (original data is preserved in history).`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubstitution()}
              disabled={loading || !subFirst.trim() || !subLast.trim()}
            >
              Save substitution
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Select value={subTitle} onValueChange={(value) => setSubTitle(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TITLE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gender (must match)</Label>
              <Select
                value={subGender}
                onValueChange={(value) =>
                  setSubGender((value as "male" | "female") ?? subGender)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input value={subFirst} onChange={(e) => setSubFirst(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input value={subLast} onChange={(e) => setSubLast(e.target.value)} />
            </div>
          </div>
      </ResponsiveDialog>
    </div>
  );
}
