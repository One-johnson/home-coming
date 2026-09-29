"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  Loader2Icon,
  ReceiptTextIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useRepSession } from "@/components/portal/RepSessionProvider";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadFileToConvex } from "@/lib/galleryUpload";
import { compressImageForUpload } from "@/lib/imageCompress";
import { friendlyError } from "@/lib/friendlyError";
import {
  AGC_ACCOMMODATION_LABELS,
  bookingStatusMeta,
  paymentStatusMeta,
} from "@/lib/agcPortal";
import type {
  AccommodationOverview,
  RepBooking,
} from "@/lib/agcBookingTypes";
import type { AgcAccommodationType, AgcRegion } from "@/lib/agcPortal";
import {
  capacityProblem,
  computeBookingSummary,
  describeUnits,
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

/** Per-booking payment dialog — its own state, so cards never leak values. */
function PaymentDialog({
  booking,
  isOffline,
  bankDetails,
  onClose,
  onSubmitOffline,
  onSubmitOnline,
  submitting,
}: {
  booking: RepBooking;
  isOffline: boolean;
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
  onSubmitOnline: (booking: RepBooking, gateway: "stripe" | "paypal") => void;
  submitting: boolean;
}) {
  const [amountPaid, setAmountPaid] = useState(
    booking.offline?.amountPaid ? String(booking.offline.amountPaid) : "",
  );
  const [paymentRef, setPaymentRef] = useState(
    booking.offline?.referenceNumber ?? "",
  );
  const [paymentDate, setPaymentDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [method] = useState<"bank_transfer" | "momo">("momo");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [gateway, setGateway] = useState<"stripe" | "paypal">("stripe");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isOffline ? "Submit payment receipt" : "Pay online"}
          </DialogTitle>
          <DialogDescription>
            Booking {booking.referenceNumber} · {booking.currency}{" "}
            {booking.totalAmount} ·{" "}
            {booking.guests.filter((g) => g.status === "active").length} guest(s)
          </DialogDescription>
        </DialogHeader>

        {isOffline ? (
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
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
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
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Payment provider</Label>
              <Select
                value={gateway}
                onValueChange={(value) =>
                  setGateway((value as "stripe" | "paypal") ?? gateway)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be redirected to complete the payment securely, then
              returned here.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting || (isOffline && !receipt)}
            onClick={() =>
              isOffline
                ? onSubmitOffline(booking, {
                    amountPaid,
                    paymentRef,
                    paymentDate,
                    method,
                    receipt,
                  })
                : onSubmitOnline(booking, gateway)
            }
          >
            {submitting && <Loader2Icon className="size-4 animate-spin" />}
            {isOffline ? (
              <>
                <ReceiptTextIcon className="size-4" /> Upload receipt
              </>
            ) : (
              "Continue to payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No bookable guests found</DialogTitle>
            <DialogDescription>
              The file has no valid guest rows. Fix the problems below and
              upload again.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
            {preview.errors.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onReset}>
              Choose another file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review your sheet</DialogTitle>
          <DialogDescription>
            {preview.rows.length} guest{preview.rows.length === 1 ? "" : "s"}{" "}
            ready to book.
            {preview.errors.length > 0 &&
              ` ${preview.errors.length} row${preview.errors.length === 1 ? "" : "s"} will be skipped (listed below).`}
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onReset}>
            Choose another file
          </Button>
          <Button type="button" onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2Icon className="size-4 animate-spin" />}
            Confirm &amp; book {preview.rows.length} guest
            {preview.rows.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RepAccommodationTab() {
  const { sessionToken } = useRepSession();
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
  const submitOffline = useMutation(api.agcBookings.submitOfflineBookingPayment);
  const substitute = useMutation(api.agcBookings.substituteGuest);
  const generateUploadUrl = useMutation(api.agcPortal.generateReceiptUploadUrl);
  const createCheckout = useAction(api.stripeCheckout.createCheckoutSession);
  const downloadTemplate = useAction(api.agcExcel.downloadBookingTemplate);
  const createFromExcel = useAction(api.agcExcel.createBookingFromExcel);
  const previewExcelAction = useAction(api.agcExcel.previewBookingExcel);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastBooking, setLastBooking] = useState<{
    bookingId: string;
    referenceNumber: string;
    totalAmount: number;
    currency: string;
    expiresAt: number;
  } | null>(null);

  // Payment dialog (per-booking; null = closed)
  const [payTarget, setPayTarget] = useState<RepBooking | null>(null);

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<RepBooking | null>(null);

  // Substitution dialog
  const [subTarget, setSubTarget] = useState<RepBooking["guests"][number] | null>(
    null,
  );
  const [subFirst, setSubFirst] = useState("");
  const [subLast, setSubLast] = useState("");
  const [subGender, setSubGender] = useState<"male" | "female">("male");
  const [subTitle, setSubTitle] = useState("");

  // Bookings list filters
  const [filter, setFilter] = useState<
    "all" | "active" | "awaiting" | "closed"
  >("all");
  const [search, setSearch] = useState("");

  // Excel flow
  const [excelFileName, setExcelFileName] = useState("");
  const [excelStorageId, setExcelStorageId] = useState<Id<"_storage"> | null>(null);
  const [excelPreview, setExcelPreview] = useState<ExcelPreview | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const isOffline = overview ? overview.isGhsRegion : true;
  const currency = overview?.currency ?? "GHS";
  const region: AgcRegion = overview?.region ?? "ghana";

  const summary = useMemo(
    () => computeBookingSummary(drafts, region),
    [drafts, region],
  );
  const capacityIssue = useMemo(
    () => (overview ? capacityProblem(summary, overview.availability) : null),
    [summary, overview],
  );
  const allDraftsValid = drafts.length > 0 && drafts.every(draftIsValid);

  const availabilityFor = (type: string) =>
    overview?.availability.find((row) => row.accommodationType === type);

  const addDraft = () => setDrafts((prev) => [...prev, emptyDraft()]);

  const updateDraft = (index: number, patch: Partial<Draft>) =>
    setDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );

  const removeDraft = (index: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== index));

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
        paymentMode: isOffline ? "offline" : "stripe",
      });
      setLastBooking({
        bookingId: result.bookingId,
        referenceNumber: result.referenceNumber,
        totalAmount: result.totalAmount,
        currency: result.currency,
        expiresAt: result.expiresAt,
      });
      setDrafts([]);
      toast.success(
        `Reservation held until ${new Date(result.expiresAt).toLocaleString()}`,
      );
    } catch (err) {
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
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  const handlePayOnline = async (booking: RepBooking) => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const origin = window.location.origin;
      const paymentResult = await createCheckout({
        type: "agc_booking",
        recordId: booking._id,
        successUrl: `${origin}/portal/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/portal?canceled=1`,
      });
      if (paymentResult.mode === "checkout") {
        window.location.href = paymentResult.url;
        return;
      }
      setPayTarget(null);
      toast.success(paymentResult.message ?? "Payment recorded.");
    } catch (err) {
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
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
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
      const friendly = friendlyError(err);
      setError(
        friendly.detail ? `${friendly.title}: ${friendly.detail}` : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
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
    const matchesFilter = (booking: RepBooking) => {
      switch (filter) {
        case "active":
          return booking.bookingStatus === "reserved" || booking.bookingStatus === "pending_verification" || booking.bookingStatus === "correction_requested";
        case "awaiting":
          return booking.paymentStatus === "awaiting_payment" || booking.paymentStatus === "correction_requested";
        case "closed":
          return booking.bookingStatus === "confirmed" || booking.bookingStatus === "cancelled" || booking.bookingStatus === "expired";
        default:
          return true;
      }
    };
    const term = search.trim().toLowerCase();
    return all.filter(
      (booking) =>
        matchesFilter(booking) &&
        (!term ||
          booking.referenceNumber.toLowerCase().includes(term) ||
          booking.guests.some((guest) =>
            `${guest.firstName} ${guest.lastName}`.toLowerCase().includes(term),
          )),
    );
  }, [bookings, filter, search]);

  return (
    <div className="space-y-8">
      {/* Availability — skeletons while loading */}
      {overview === undefined && sessionToken ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-52" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        overview && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.availability.map((row) => {
              const soldOut = row.available <= 0;
              return (
                <Card key={row.accommodationType} className={soldOut ? "opacity-60" : undefined}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium">
                      {AGC_ACCOMMODATION_LABELS[
                        row.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
                      ] ?? row.accommodationType}
                      {soldOut && (
                        <Badge variant="outline" className="text-[10px]">
                          sold out
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {row.available} of {row.total} available ({row.scope.replace(/_/g, " ")})
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">
                      {currency}{" "}
                      {isOffline
                        ? row.priceGhs
                        : row.priceUsd}
                    </p>
                    {row.accommodationType === "ebpv" && (
                      <p className="text-xs text-muted-foreground">
                        Bishop rate: {currency}{" "}
                        {isOffline ? row.bishopPriceGhs : row.bishopPriceUsd}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* Booking form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Build your booking</CardTitle>
          <CardDescription>
            Add guests one by one. Rooms (Wise as Serpents, Good General, EBPV)
            accommodate 2 guests and are priced per room.
          </CardDescription>
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

          {drafts.map((draft, index) => {
            const row = availabilityFor(draft.accommodationType);
            const soldOut = row ? row.available <= 0 : false;
            return (
              <div key={index} className="rounded-lg border p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Select
                      value={draft.title}
                      onValueChange={(value) =>
                        updateDraft(index, { title: value ?? draft.title })
                      }
                    >
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
                    <Label>
                      First name{!draft.firstName.trim() && <span className="text-destructive"> *</span>}
                    </Label>
                    <Input
                      value={draft.firstName}
                      aria-invalid={!draft.firstName.trim()}
                      onChange={(e) =>
                        updateDraft(index, { firstName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Last name{!draft.lastName.trim() && <span className="text-destructive"> *</span>}
                    </Label>
                    <Input
                      value={draft.lastName}
                      aria-invalid={!draft.lastName.trim()}
                      onChange={(e) =>
                        updateDraft(index, { lastName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Gender</Label>
                    <Select
                      value={draft.gender}
                      onValueChange={(value) =>
                        updateDraft(index, {
                          gender: (value as "male" | "female") ?? draft.gender,
                        })
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
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Accommodation</Label>
                    <Select
                      value={draft.accommodationType}
                      onValueChange={(value) => {
                        const next = (value ?? draft.accommodationType) as AgcAccommodationType;
                        updateDraft(index, {
                          accommodationType: next,
                          // Bishop rate is EBPV-only — keep the pair consistent.
                          isBishopRate: next === "ebpv" ? draft.isBishopRate : false,
                        });
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {overview?.accommodationTypes.map((type) => {
                          const avail = availabilityFor(type.type);
                          const disabled = avail ? avail.available <= 0 : false;
                          return (
                            <SelectItem
                              key={type.type}
                              value={type.type}
                              disabled={disabled}
                            >
                              {type.label}
                              {disabled ? " — sold out" : ""}
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
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <Checkbox
                      checked={draft.isBishopRate}
                      disabled={draft.accommodationType !== "ebpv"}
                      onCheckedChange={(checked) =>
                        updateDraft(index, { isBishopRate: checked === true })
                      }
                    />
                    Bishop Special Rate (EBPV only)
                  </label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDraft(index)}
                  className="mt-3 h-auto gap-1 px-2 py-1 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2Icon className="size-3" /> Remove guest
                </Button>
              </div>
            );
          })}

          {/* Sticky live summary (mobile: sticks to the bottom) */}
          {drafts.length > 0 && (
            <div className="sticky bottom-2 z-10 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {drafts.length} guest{drafts.length === 1 ? "" : "s"} ·{" "}
                    {describeUnits(summary)}
                  </p>
                  {summary.lines.map((line) => (
                    <p key={`${line.accommodationType}-${line.isBishopRate}`} className="text-xs text-muted-foreground">
                      {line.units} {line.unitLabel}
                      {line.units === 1 ? "" : "s"} × {currency} {line.unitPrice}
                      {line.isBishopRate ? " (bishop)" : ""} = {currency} {line.subtotal}
                    </p>
                  ))}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-semibold">
                    {currency} {summary.totalAmount}
                  </p>
                </div>
              </div>
              {capacityIssue && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                  <AlertTriangleIcon className="size-3.5" /> {capacityIssue}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addDraft}>
              + Add guest
            </Button>
            {drafts.length > 0 && (
              <Button
                type="button"
                onClick={() => void handleCreateBooking()}
                disabled={loading || !allDraftsValid || Boolean(capacityIssue)}
              >
                {loading && <Loader2Icon className="size-4 animate-spin" />}
                Reserve &amp; hold
              </Button>
            )}
            {drafts.length > 0 && !allDraftsValid && (
              <p className="self-center text-xs text-muted-foreground">
                Fill in every guest&apos;s first and last name to continue.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Or upload an Excel sheet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We&apos;ll check the file and show you a preview first — nothing is
              booked until you confirm. Rows with problems are listed before you
              commit.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDownloadTemplate()}
              >
                Download template
              </Button>
              <Input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                className="max-w-xs"
                onChange={(e) => void handleExcelSelect(e.target.files?.[0] ?? null)}
              />
              {excelPreview && (
                <Button type="button" variant="ghost" onClick={resetExcel}>
                  Clear
                </Button>
              )}
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

      {/* Bookings list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your bookings</CardTitle>
          <CardDescription>
            Holds expire automatically at the earlier of {overview?.holdHours ?? 72}{" "}
            hours or the registration deadline.
          </CardDescription>
          {(bookings?.length ?? 0) > 3 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Tabs
                value={filter}
                onValueChange={(value) =>
                  setFilter(value as typeof filter)
                }
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="awaiting">Awaiting payment</TabsTrigger>
                  <TabsTrigger value="closed">Closed</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Reference or guest name…"
                  className="h-9 w-56 pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {lastBooking && (
            <Alert>
              <AlertTitle>
                Reservation {lastBooking.referenceNumber} created
              </AlertTitle>
              <AlertDescription>
                {lastBooking.currency} {lastBooking.totalAmount} — held until{" "}
                {new Date(lastBooking.expiresAt).toLocaleString()}.
                {isOffline
                  ? " Pay by bank transfer/MoMo and submit your receipt on the booking below."
                  : " Complete payment online to confirm."}
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
            <div className="rounded-lg border border-dashed p-6 text-sm">
              <p className="font-medium">How booking works</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Add guests above and reserve — beds are held for you.</li>
                <li>
                  {isOffline
                    ? "Pay by bank transfer/MoMo and upload your receipt."
                    : "Pay online with Stripe or PayPal."}
                </li>
                <li>
                  Finance confirms your payment and your booking is locked in.
                </li>
              </ol>
              {overview?.accommodationBankDetails && isOffline && (
                <p className="mt-3 rounded bg-muted p-3 text-xs whitespace-pre-line">
                  {overview.accommodationBankDetails}
                </p>
              )}
            </div>
          ) : filteredBookings.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No bookings match this filter.
            </p>
          ) : (
            filteredBookings.map((booking) => {
              const status = bookingStatusMeta(booking.bookingStatus);
              const payStatus = paymentStatusMeta(booking.paymentStatus);
              const canPayOffline =
                booking.paymentMode === "offline" &&
                booking.bookingStatus === "reserved" &&
                (booking.paymentStatus === "awaiting_payment" ||
                  booking.paymentStatus === "correction_requested");
              const canPayOnline =
                booking.paymentMode !== "offline" &&
                booking.bookingStatus === "reserved" &&
                booking.paymentStatus === "awaiting_payment";
              const activeGuests = booking.guests.filter(
                (guest) => guest.status === "active",
              );
              return (
                <div key={booking._id} className="rounded-lg border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs tracking-wider">
                      {booking.referenceNumber || "(pending)"}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                      <Badge variant="outline" className={payStatus.className}>
                        {payStatus.label}
                      </Badge>
                      {booking.bookingStatus === "reserved" && booking.expiresAt && (
                        <HoldCountdown expiresAt={booking.expiresAt} />
                      )}
                    </div>
                  </div>
                  <p className="mt-2">
                    <strong>
                      {booking.currency} {booking.totalAmount}
                    </strong>{" "}
                    · {booking.guests.length} guest(s) ·{" "}
                    {booking.paymentMode === "offline" ? "offline" : "online"}
                  </p>
                  {booking.adminMessage && (
                    <p className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-300">
                      {booking.adminMessage}
                    </p>
                  )}

                  <div className="mt-3 space-y-1">
                    {activeGuests.map((guest) => (
                      <div
                        key={guest._id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span>
                          {guest.title} {guest.firstName} {guest.lastName} ·{" "}
                          {guest.gender} ·{" "}
                          {
                            AGC_ACCOMMODATION_LABELS[
                              guest.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
                            ]
                          }
                          {guest.isBishopRate && " · Bishop rate"}
                        </span>
                        {booking.bookingStatus === "reserved" ||
                        booking.bookingStatus === "confirmed" ? (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            onClick={() => openSubstitution(guest)}
                          >
                            Substitute
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {canPayOffline && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPayTarget(booking)}
                      >
                        <ReceiptTextIcon className="size-4" /> Submit payment receipt
                      </Button>
                    )}
                    {canPayOnline && (
                      <Button type="button" onClick={() => setPayTarget(booking)}>
                        Pay online
                      </Button>
                    )}
                    {booking.bookingStatus === "reserved" && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCancelTarget(booking)}
                        disabled={loading}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Payment dialog */}
      {payTarget && (
        <PaymentDialog
          booking={payTarget}
          isOffline={payTarget.paymentMode === "offline"}
          bankDetails={overview?.accommodationBankDetails}
          onClose={() => setPayTarget(null)}
          onSubmitOffline={(target, data) => void handleSubmitOffline(target, data)}
          onSubmitOnline={(target) => void handlePayOnline(target)}
          submitting={loading}
        />
      )}

      {/* Excel preview dialog */}
      {excelPreview && (
        <ExcelPreviewDialog
          preview={excelPreview}
          onClose={resetExcel}
          onReset={resetExcel}
          onConfirm={() => void handleExcelConfirm()}
          submitting={loading}
        />
      )}

      {/* Cancel confirmation */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this reservation?</DialogTitle>
            <DialogDescription>
              {cancelTarget?.referenceNumber} — cancelling releases the held
              beds back to the pool immediately. Other hubs can take them. You
              would need to book again if space remains.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelTarget(null)}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Substitution dialog */}
      <Dialog
        open={subTarget !== null}
        onOpenChange={(open) => !open && setSubTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substitute guest</DialogTitle>
            <DialogDescription>
              Replacing {subTarget?.title} {subTarget?.firstName}{" "}
              {subTarget?.lastName}. Same gender and accommodation type required
              (original data is preserved in history).
            </DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSubTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubstitution()}
              disabled={loading || !subFirst.trim() || !subLast.trim()}
            >
              Save substitution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
