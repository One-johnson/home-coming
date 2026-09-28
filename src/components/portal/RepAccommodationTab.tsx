"use client";

import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadFileToConvex } from "@/lib/galleryUpload";
import { compressImageForUpload } from "@/lib/imageCompress";
import { friendlyError } from "@/lib/friendlyError";
import {
  AGC_ACCOMMODATION_LABELS,
  bookingStatusMeta,
  paymentStatusMeta,
} from "@/lib/agcPortal";

type AvailabilityRow = {
  accommodationType: string;
  scope: string;
  total: number;
  available: number;
  priceGhs: number;
  priceUsd: number;
  bishopPriceGhs: number;
  bishopPriceUsd: number;
};

type GuestDraft = {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title: string;
  accommodationType: string;
  isBishopRate: boolean;
};

type GuestRow = {
  _id: string;
  firstName: string;
  lastName: string;
  gender: string;
  title: string;
  accommodationType: string;
  isBishopRate: boolean;
  status: string;
};

const TITLE_OPTIONS = ["Bishop", "Rev.", "Pastor", "Elder", "Mr.", "Mrs.", "Ms.", "Dr."];

export function RepAccommodationTab() {
  const { sessionToken } = useRepSession();
  const overview = useQuery(
    api.agcBookings.getAccommodationOverview,
    sessionToken ? { sessionToken } : "skip",
  );
  const bookings = useQuery(
    api.agcBookings.listRepBookings,
    sessionToken ? { sessionToken } : "skip",
  );
  const createBooking = useMutation(api.agcBookings.createBooking);
  const cancelBooking = useMutation(api.agcBookings.cancelBooking);
  const submitOffline = useMutation(api.agcBookings.submitOfflineBookingPayment);
  const substitute = useMutation(api.agcBookings.substituteGuest);
  const generateUploadUrl = useMutation(api.agcPortal.generateReceiptUploadUrl);
  const createCheckout = useAction(api.stripeCheckout.createCheckoutSession);
  const downloadTemplate = useAction(api.agcExcel.downloadBookingTemplate);
  const createFromExcel = useAction(api.agcExcel.createBookingFromExcel);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const [drafts, setDrafts] = useState<GuestDraft[]>([]);
  const [gateway, setGateway] = useState<"stripe" | "paypal">("stripe");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [method] = useState<"bank_transfer" | "momo">("momo");
  const [receipt, setReceipt] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastBooking, setLastBooking] = useState<{
    bookingId: string;
    referenceNumber: string;
    totalAmount: number;
    currency: string;
    expiresAt: number;
  } | null>(null);
  const [subTarget, setSubTarget] = useState<GuestRow | null>(null);
  const [subFirst, setSubFirst] = useState("");
  const [subLast, setSubLast] = useState("");
  const [subGender, setSubGender] = useState<"male" | "female">("male");
  const [subTitle, setSubTitle] = useState("");

  const isOffline = overview ? overview.isGhsRegion : true;
  const currency = isOffline ? "GHS" : "USD";

  const priceFor = (row: AvailabilityRow, bishop: boolean) =>
    isOffline
      ? bishop
        ? row.bishopPriceGhs
        : row.priceGhs
      : bishop
        ? row.bishopPriceUsd
        : row.priceUsd;

  const addDraft = () =>
    setDrafts((prev) => [
      ...prev,
      {
        firstName: "",
        lastName: "",
        gender: "male",
        title: "Member",
        accommodationType: "dormitory",
        isBishopRate: false,
      },
    ]);

  const updateDraft = (index: number, patch: Partial<GuestDraft>) =>
    setDrafts((prev) =>
      prev.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );

  const removeDraft = (index: number) =>
    setDrafts((prev) => prev.filter((_, i) => i !== index));

  const handleCreateBooking = async () => {
    if (!sessionToken || drafts.length === 0) return;
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
          accommodationType: draft.accommodationType as
            | "dormitory"
            | "hostel"
            | "wise_serpents"
            | "good_general"
            | "ebpv",
          isBishopRate: draft.isBishopRate,
        })),
        paymentMode: isOffline ? "offline" : gateway,
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

  const handleOfflineSubmit = async (bookingId: string) => {
    if (!sessionToken || !receipt) {
      setError("Attach a scan or photo of your payment receipt (JPG, PNG or PDF).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Photos are compressed client-side; PDFs pass through unchanged.
      const { file: uploadFile } = await compressImageForUpload(receipt);
      const storageId = await uploadFileToConvex(uploadFile, () =>
        generateUploadUrl({ sessionToken }),
      );
      await submitOffline({
        sessionToken,
        bookingId: bookingId as Id<"agcBookings">,
        offline: {
          amountPaid: Number(amountPaid) || 0,
          referenceNumber: paymentRef,
          paymentDate,
          method,
          receiptStorageId: storageId,
          receiptFileName: uploadFile.name,
          receiptContentType: uploadFile.type || undefined,
        },
      });
      toast.success("Receipt submitted — finance will review it.");
      setLastBooking(null);
      setReceipt(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  const handleOnlinePay = async (bookingId: string) => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const origin = window.location.origin;
      const paymentResult = await createCheckout({
        type: "agc_booking",
        recordId: bookingId,
        successUrl: `${origin}/portal/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/portal?canceled=1`,
      });
      if (paymentResult.mode === "checkout") {
        window.location.href = paymentResult.url;
        return;
      }
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

  const handleCancel = async (bookingId: string) => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      await cancelBooking({
        sessionToken,
        bookingId: bookingId as Id<"agcBookings">,
      });
      toast.success("Reservation cancelled — beds returned to the pool.");
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

  const handleExcelUpload = async () => {
    if (!sessionToken || !excelFile) {
      setError("Choose an .xlsx file first.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const storageId = await uploadFileToConvex(excelFile, () =>
        generateUploadUrl({ sessionToken }),
      );
      const result = await createFromExcel({ sessionToken, storageId });
      setLastBooking({
        bookingId: result.bookingId,
        referenceNumber: result.referenceNumber,
        totalAmount: result.totalAmount,
        currency: result.currency,
        expiresAt: Date.now() + 72 * 60 * 60 * 1000,
      });
      setExcelFile(null);
      if (excelInputRef.current) excelInputRef.current.value = "";
      if (result.errors.length > 0) {
        toast.warning(
          `Booked ${result.guestCount} guest(s); ${result.errors.length} row(s) skipped: ${result.errors[0]}`,
          { duration: 10000 },
        );
      } else {
        toast.success(
          `Booked ${result.guestCount} guest(s) from Excel (${result.referenceNumber}).`,
        );
      }
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

  const openSubstitution = (guest: GuestRow) => {
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

  return (
    <div className="space-y-8">
      {overview && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overview.availability.map((row: AvailabilityRow) => (
            <Card key={row.accommodationType}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {AGC_ACCOMMODATION_LABELS[row.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS] ?? row.accommodationType}
                </CardTitle>
                <CardDescription>
                  {row.available} of {row.total} available ({row.scope.replace(/_/g, " ")})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {currency} {priceFor(row, false)}
                </p>
                {row.accommodationType === "ebpv" && (
                  <p className="text-xs text-muted-foreground">
                    Bishop rate: {currency} {priceFor(row, true)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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

          {drafts.map((draft, index) => (
            <div
              key={index}
              className="rounded-lg border p-4"
            >
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
                  <Label>First name</Label>
                  <Input
                    value={draft.firstName}
                    onChange={(e) =>
                      updateDraft(index, { firstName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input
                    value={draft.lastName}
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
                    onValueChange={(value) =>
                      updateDraft(index, {
                        accommodationType: value ?? draft.accommodationType,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {overview?.accommodationTypes.map(
                        (type: { type: string; label: string }) => (
                          <SelectItem key={type.type} value={type.type}>
                            {type.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox
                    checked={draft.isBishopRate}
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
          ))}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addDraft}>
              + Add guest
            </Button>
            {drafts.length > 0 && (
              <Button
                type="button"
                onClick={handleCreateBooking}
                disabled={loading}
              >
                {loading && <Loader2Icon className="size-4 animate-spin" />}
                Reserve & hold
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Or upload an Excel sheet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bulk-add many guests at once. Rows with errors are skipped and
              reported — the rest is booked.
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
                onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                onClick={() => void handleExcelUpload()}
                disabled={loading || !excelFile}
              >
                {loading && <Loader2Icon className="size-4 animate-spin" />}
                Upload & book
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your bookings</CardTitle>
          <CardDescription>
            Holds expire automatically at the earlier of {overview?.holdHours ?? 72} hours or the registration deadline.
          </CardDescription>
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
                  ? " Pay by bank transfer/MoMo and upload your receipt below."
                  : " Complete payment online to confirm."}
              </AlertDescription>
            </Alert>
          )}

          {(bookings ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          )}

          {(bookings ?? []).map((booking) => {
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
                  <div className="flex gap-2">
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
                    <Badge variant="outline" className={payStatus.className}>
                      {payStatus.label}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2">
                  <strong>
                    {booking.currency} {booking.totalAmount}
                  </strong>{" "}
                  · {booking.guests.length} guest(s) ·{" "}
                  {booking.paymentMode === "offline" ? "offline" : "online"}
                </p>
                {booking.expiresAt && booking.bookingStatus === "reserved" && (
                  <p className="text-xs text-muted-foreground">
                    Hold expires {new Date(booking.expiresAt).toLocaleString()}
                  </p>
                )}
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
                    <>
                      <div className="grid w-full gap-2 sm:grid-cols-3">
                        <Input
                          placeholder={`Amount paid (${booking.currency})`}
                          type="number"
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(e.target.value)}
                        />
                        <Input
                          placeholder="Transaction reference"
                          value={paymentRef}
                          onChange={(e) => setPaymentRef(e.target.value)}
                        />
                        <Input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                        />
                      </div>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                      />
                      <Button
                        type="button"
                        onClick={() => void handleOfflineSubmit(booking._id)}
                        disabled={loading}
                      >
                        Upload receipt
                      </Button>
                    </>
                  )}
                  {canPayOnline && (
                    <>
                      <Select
                        value={gateway}
                        onValueChange={(value) =>
                          setGateway(
                            (value as "stripe" | "paypal") ?? gateway,
                          )
                        }
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stripe">Stripe</SelectItem>
                          <SelectItem value="paypal">PayPal</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        onClick={() => void handleOnlinePay(booking._id)}
                        disabled={loading}
                      >
                        Pay online
                      </Button>
                    </>
                  )}
                  {booking.bookingStatus === "reserved" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleCancel(booking._id)}
                      disabled={loading}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog
        open={subTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSubTarget(null);
        }}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
