"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BanknoteIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  CheckIcon,
  CircleCheckIcon,
  DownloadIcon,
  ClipboardListIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
  UploadIcon,
  UserXIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatTile } from "@/components/portal/StatTile";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadFileToConvex } from "@/lib/galleryUpload";
import { compressImageForUpload } from "@/lib/imageCompress";
import { downloadBase64File } from "@/lib/downloadFile";
import { friendlyError } from "@/lib/friendlyError";
import {
  AGC_REGION_LABELS,
  isGhsRegion,
  paymentStatusMeta,
} from "@/lib/agcPortal";
import { amountsMatch } from "@/lib/bookingMath";
import {
  REGISTRATION_FILTERS,
  REGISTRATION_QUICK_PICKS,
  matchesRegistrationFilter,
  registrationStage,
} from "@/lib/agcRegistrationView";
import type { RegistrationFilterId } from "@/lib/agcRegistrationView";

type RegistrationRow = {
  _id: string;
  referenceNumber: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  totalAmount: number;
  paymentMode: string;
  paymentStatus: string;
  /** Online registrations stuck at checkout — show a resume-payment button. */
  canResumePayment: boolean;
  adminMessage: string | null;
  offline: {
    amountPaid: number;
    referenceNumber: string;
    paymentDate: string;
    method: string;
    receiptFileName?: string;
  } | null;
  receiptUrl: string | null;
  createdAt: number;
};

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Submitted -> Under review -> Confirmed progress tracker for one purchase. */
function StatusTimeline({ status }: { status: string }) {
  const stage = registrationStage(status);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {stage.steps.map((label, i) => {
        const done = i < stage.current;
        const active = i === stage.current;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                done && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
                active && stage.rejected &&
                  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
                active && !stage.rejected &&
                  "bg-gold/20 text-ink dark:bg-gold/15 dark:text-gold",
                !done && !active && "bg-muted text-muted-foreground"
              )}
            >
              {done && <CheckIcon className="size-2.5" aria-hidden />}
              {active && stage.rejected && <XIcon className="size-2.5" aria-hidden />}
              {label}
            </div>
            {i < stage.steps.length - 1 && (
              <span
                aria-hidden
                className={cn("h-px w-3", i < stage.current ? "bg-emerald-400" : "bg-border")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Drag-and-drop receipt uploader with image preview and a file chip. */
function ReceiptDropzone({
  file,
  previewUrl,
  onFile,
  onClear,
}: {
  file: File | null;
  previewUrl: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (picked: File | null) => {
    if (!picked) return;
    if (!/.(pdf|jpe?g|png)$/i.test(picked.name)) {
      toast.error("Receipt must be a PDF, JPG or PNG file.");
      return;
    }
    onFile(picked);
  };

  return (
    <div className="space-y-2">
      <Label>Payment receipt</Label>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Receipt preview: ${file.name}`}
              className="size-14 rounded-lg border object-cover"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-card">
              <ReceiptTextIcon className="size-6 text-gold-dark" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB · Ready to submit
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onClear}
            aria-label="Remove receipt"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
          className={cn(
            "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed p-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            dragging ? "border-gold bg-gold/5" : "border-border hover:border-gold/50 hover:bg-muted/40",
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-gold/15">
            <UploadIcon className="size-4 text-gold-dark" />
          </span>
          <span className="text-sm font-medium">Drop receipt here or tap to browse</span>
          <span className="text-xs text-muted-foreground">
            PDF, JPG or PNG — finance reviews it manually
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function RepRegistrationTab() {
  const { sessionToken, handleSessionError } = useRepSession();
  const rep = useQuery(api.agcPortal.getRepProfile, sessionToken ? { sessionToken } : "skip");
  const portalConfig = useQuery(api.agcPortal.getPortalConfig);
  const registrations = useQuery(
    api.agcPortal.listRepRegistrations,
    sessionToken ? { sessionToken } : "skip",
  );
  const submitOffline = useMutation(api.agcPortal.submitOfflineRegistration);
  const createOnline = useMutation(api.agcPortal.createOnlineRegistration);
  const generateUploadUrl = useMutation(api.agcPortal.generateReceiptUploadUrl);
  const createCheckout = useAction(api.stripeCheckout.createCheckoutSession);
  const exportRegistrations = useAction(
    api.agcExcel.exportRepRegistrationsExcel,
  );

  const [quantity, setQuantity] = useState("1");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<"bank_transfer" | "momo">("momo");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  // Which history row is resuming Stripe checkout (resume-payment flow).
  const [resumingId, setResumingId] = useState<string | null>(null);
  // History filter chips + reference search.
  const [filter, setFilter] = useState<RegistrationFilterId>("all");
  const [search, setSearch] = useState("");
  // Post-submit success panel (reference number of the new purchase).
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);

  const isOffline = rep ? isGhsRegion(rep.hubRegion) : true;
  const regionPricing = portalConfig?.regions.find(
    (entry: { region: string; price: number; currency: string }) =>
      entry.region === rep?.hubRegion,
  );
  const unitPrice = regionPricing?.price ?? 0;
  const currency = regionPricing?.currency ?? (isOffline ? "GHS" : "USD");
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));

  // Exact-amount rule: the entered amount must equal the system total —
  // the submit button stays disabled and a rejection shows while it does not.
  const expectedTotal = unitPrice * qty;
  const amountEntered = amountPaid.trim() !== "";
  const amountMatches = amountsMatch(Number(amountPaid) || 0, expectedTotal);
  // The amount input displays the exact total until the rep types a value.
  // Submit must send that same fallback — otherwise an untouched (pre-filled)
  // field would quietly submit 0 and fail the server's exact-amount check.
  const amountValue = amountEntered ? amountPaid : String(expectedTotal);

  const history = useMemo(() => registrations ?? [], [registrations]);

  // Live image preview for the receipt dropzone (object URL, revoked on change).
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const handleReceipt = (file: File | null) => {
    setReceipt(file);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(
      file && /.(jpe?g|png)$/i.test(file.name) ? URL.createObjectURL(file) : null,
    );
  };

  // Summary counts across ALL registrations — quantity-weighted, mirroring
  // how the overview counts delegates.
  const summary = useMemo(() => {
    const totals = { paid: 0, pending: 0, count: 0, paidAmount: 0, pendingAmount: 0 };
    for (const row of history) {
      totals.count += 1;
      if (row.paymentStatus === "confirmed") {
        totals.paid += row.quantity;
        totals.paidAmount += row.totalAmount;
      } else if (row.paymentStatus !== "rejected") {
        // Rejected receipts count as cancelled (mirrors getRepOverview).
        totals.pending += row.quantity;
        totals.pendingAmount += row.totalAmount;
      }
    }
    return totals;
  }, [history]);

  const filteredHistory = useMemo(
    () =>
      history.filter(
        (row) =>
          matchesRegistrationFilter(filter, row.paymentStatus) &&
          (!search.trim() ||
            row.referenceNumber.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [history, filter, search],
  );

  // Ticking clock (kept out of render for react-hooks/purity).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Deadline urgency chip (day resolution).
  const daysLeft = portalConfig?.deadline
    ? Math.max(0, Math.ceil((Date.parse(portalConfig.deadline) - now) / 86_400_000))
    : null;

  const handleResumePayment = async (row: RegistrationRow) => {
    if (!sessionToken) return;
    setResumingId(row._id);
    setError("");
    try {
      const origin = window.location.origin;
      const paymentResult = await createCheckout({
        type: "agc_registration",
        recordId: row._id,
        successUrl: `${origin}/portal/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/portal?canceled=1`,
      });
      if (paymentResult.mode === "checkout") {
        window.location.assign(paymentResult.url);
        return;
      }
      toast.success(paymentResult.message ?? "Payment recorded.");
    } catch (err) {
      // Expired/revoked session → bounce to sign-in with a friendly toast.
      if (handleSessionError(err)) return;
      const friendly = friendlyError(err);
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setResumingId(null);
    }
  };

  const handleDownloadExcel = async () => {
    if (!sessionToken) return;
    setExporting(true);
    try {
      const result = await exportRegistrations({ sessionToken });
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

  const handleOfflineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    if (!receipt) {
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
      const result = await submitOffline({
        sessionToken,
        quantity: qty,
        offline: {
          amountPaid: Number(amountValue) || 0,
          referenceNumber: paymentRef,
          paymentDate,
          method,
          receiptStorageId: storageId,
          receiptFileName: uploadFile.name,
          receiptContentType: uploadFile.type || undefined,
        },
      });
      setLastSubmitted(result.referenceNumber);
      toast.success(
        "Receipt submitted — finance will review it and email you the outcome.",
      );
      handleReceipt(null);
      setAmountPaid("");
      setPaymentRef("");
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

  const handleOnlineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      // PayPal is disabled — online hubs pay through Stripe checkout.
      const created = await createOnline({
        sessionToken,
        quantity: qty,
        paymentMode: "stripe",
      });
      const origin = window.location.origin;
      const paymentResult = await createCheckout({
        type: "agc_registration",
        recordId: created.registrationId,
        successUrl: `${origin}/portal/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/portal?canceled=1`,
      });
      if (paymentResult.mode === "checkout") {
        window.location.href = paymentResult.url;
        return;
      }
      toast.success(paymentResult.message ?? "Registration recorded.");
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

  return (
    <div className="space-y-8">
      {portalConfig?.locked && (
        <Alert variant="destructive">
          <CircleAlertIcon className="size-4" />
          <AlertTitle>Registrations are paused</AlertTitle>
          <AlertDescription>
            The convention administrators have temporarily locked new
            registrations. You can still review your purchase history below —
            please check back later.
          </AlertDescription>
        </Alert>
      )}

      {/* Registration summary — totals across every purchase. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          icon={ClipboardListIcon}
          label="Total registrations"
          value={summary.count}
          hint={`${summary.paid + summary.pending} delegate${summary.paid + summary.pending === 1 ? "" : "s"} in total`}
        />
        <StatTile
          icon={CircleCheckIcon}
          tone="positive"
          label="Registered / booked (paid)"
          value={summary.paid}
          hint={`${currency} ${summary.paidAmount} confirmed`}
        />
        <StatTile
          icon={UserXIcon}
          tone="warning"
          label="Reserved (awaiting payment)"
          value={summary.pending}
          hint={`${currency} ${summary.pendingAmount} outstanding`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="order-first self-start lg:order-none">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Register delegates</CardTitle>
                <CardDescription>
                  {rep
                    ? `${rep.hubName} — ${AGC_REGION_LABELS[rep.hubRegion as keyof typeof AGC_REGION_LABELS] ?? rep.hubRegion}`
                    : "Loading…"}
                </CardDescription>
              </div>
              {daysLeft !== null && (
                <Badge
                  variant="outline"
                  className={
                    daysLeft <= 14
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "text-xs"
                  }
                >
                  <CalendarClockIcon className="mr-1 size-3" />
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {portalConfig?.locked && (
              <Alert variant="destructive">
                <CircleAlertIcon className="size-4" />
                <AlertTitle>Registrations are paused</AlertTitle>
                <AlertDescription>
                  The convention administrators have temporarily locked new
                  registrations. Your purchase history is unaffected.
                </AlertDescription>
              </Alert>
            )}

            {lastSubmitted && (
              <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950">
                <CircleCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                <AlertTitle className="text-emerald-800 dark:text-emerald-300">
                  Registration {lastSubmitted} submitted
                </AlertTitle>
                <AlertDescription className="text-emerald-800/90 dark:text-emerald-300/90">
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    <li>Finance reviews your receipt.</li>
                    <li>You get an email with the outcome.</li>
                    <li>Once confirmed, your delegates are locked in.</li>
                  </ol>
                </AlertDescription>
              </Alert>
            )}

            {/* Step 1 — choose delegates */}
            <section className="space-y-3">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span className="flex size-5 items-center justify-center rounded-full bg-gold/20 text-[10px] font-bold text-gold-dark">1</span>
                Choose delegates
              </p>
              <div className="rounded-xl border bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Price per delegate</p>
                    <p className="text-xl font-semibold tabular-nums text-ink">
                      {currency} {unitPrice}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setQuantity(String(Math.max(1, qty - 1)))}
                      aria-label="Remove one delegate"
                    >
                      <MinusIcon className="size-4" />
                    </Button>
                    <Input
                      id="reg-qty"
                      type="number"
                      min={1}
                      step={1}
                      className="h-8 w-14 border-0 bg-transparent text-center tabular-nums focus-visible:ring-0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      aria-label="Number of delegates"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setQuantity(String(qty + 1))}
                      aria-label="Add one delegate"
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {REGISTRATION_QUICK_PICKS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuantity(String(n))}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        qty === n
                          ? "border-gold bg-gold/15 text-ink"
                          : "text-muted-foreground hover:border-gold/40 hover:text-foreground",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="ml-auto text-right text-xs text-muted-foreground">
                    Attendee names are not needed — only the count.
                  </span>
                </div>
              </div>
            </section>

            {isOffline ? (
              <form className="space-y-5" onSubmit={handleOfflineSubmit}>
                {/* Step 2 — pay & upload receipt */}
                <section className="space-y-3">
                  <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <span className="flex size-5 items-center justify-center rounded-full bg-gold/20 text-[10px] font-bold text-gold-dark">2</span>
                    Pay &amp; upload receipt
                  </p>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total due</p>
                      <p className="text-xl font-semibold tabular-nums text-ink">
                        {currency} {unitPrice * qty}
                      </p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {qty} delegate{qty === 1 ? "" : "s"} × {currency} {unitPrice}
                      <br />
                      Payments must match the reservation.
                    </p>
                  </div>
                  <Alert>
                    <AlertTitle>Offline payment (GHS)</AlertTitle>
                    <AlertDescription>
                      Pay {currency} {unitPrice * qty} by bank transfer or mobile
                      money to the account below, then upload your receipt.
                    </AlertDescription>
                  </Alert>
                </section>
                <section className="space-y-4">
                <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-line">
                  {portalConfig?.registrationBankDetails ||
                    "Account details will be shown here once configured by the Super Admin."}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="off-amount">Amount paid ({currency})</Label>
                    <Input
                      id="off-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      aria-invalid={
                        amountEntered && !amountMatches ? true : undefined
                      }
                      value={amountValue}
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
                    {amountEntered && !amountMatches ? (
                      <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                        <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                        Rejected: you entered {currency} {amountEntered} but
                        registration costs exactly {currency} {unitPrice * qty}.
                        Nothing less, nothing more.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Defaults to {currency} {unitPrice * qty} — the exact
                        total for {qty} delegate{qty === 1 ? "" : "s"}.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="off-date">Payment date</Label>
                    <Input
                      id="off-date"
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="off-method">Payment method</Label>
                    <Select
                      value={method}
                      onValueChange={(value) =>
                        setMethod((value as "bank_transfer" | "momo") ?? method)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="momo">Mobile money</SelectItem>
                        <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="off-ref">Transaction reference</Label>
                    <Input
                      id="off-ref"
                      required
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                    />
                  </div>
                </div>
                <ReceiptDropzone
                    file={receipt}
                    previewUrl={receiptPreview}
                    onFile={handleReceipt}
                    onClear={() => handleReceipt(null)}
                  />
                </section>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    loading ||
                    portalConfig?.locked === true ||
                    !receipt ||
                    (amountEntered && !amountMatches)
                  }
                >
                  {loading && <Loader2Icon className="size-4 animate-spin" />}
                  {loading ? "Submitting…" : "Submit for review"}
                </Button>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={handleOnlineSubmit}>
                {/* Step 2 — pay online */}
                <section className="space-y-3">
                  <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <span className="flex size-5 items-center justify-center rounded-full bg-gold/20 text-[10px] font-bold text-gold-dark">2</span>
                    Pay online
                  </p>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total due</p>
                      <p className="text-xl font-semibold tabular-nums text-ink">
                        {currency} {unitPrice * qty}
                      </p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {qty} delegate{qty === 1 ? "" : "s"} × {currency} {unitPrice}
                    </p>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/5 p-3">
                    <span className="mt-0.5 flex size-4 items-center justify-center">
                      <span className="size-2 rounded-full bg-gold-dark" />
                    </span>
                    <span>
                      <span className="font-medium">Stripe</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        Cards for international payments
                      </span>
                    </span>
                  </div>
                </section>
                <Button type="submit" className="w-full" disabled={loading || portalConfig?.locked === true}>
                  {loading && <Loader2Icon className="size-4 animate-spin" />}
                  {loading
                    ? "Redirecting…"
                    : `Pay ${currency} ${unitPrice * qty} online`}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="order-last lg:order-none">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  Purchase history
                  {history.length > 0 && (
                    <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                      {history.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Registration purchases for your hub, newest first.
                </CardDescription>
              </div>
              {history.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Reference…"
                      className="h-9 w-40 pl-8"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
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
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {REGISTRATION_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        filter === f.id
                        ? "border-gold bg-gold/15 text-ink"
                        : "text-muted-foreground hover:border-gold/40 hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-gold/15">
                  <ClipboardListIcon className="size-5 text-gold-dark" />
                </span>
                <p className="text-sm font-medium">No registrations yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Use the form to register your first delegates — purchases
                  will appear here with live payment status.
                </p>
              </div>
            ) : filteredHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No purchases match this filter.
              </p>
            ) : (
              filteredHistory.map((row: RegistrationRow) => {
                const status = paymentStatusMeta(row.paymentStatus);
                return (
                  <div
                    key={row._id}
                    className="rounded-xl border p-4 text-sm transition-colors hover:border-gold/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs tracking-wider">
                        {row.referenceNumber || "(pending)"}
                      </span>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <StatusTimeline status={row.paymentStatus} />
                    </div>
                  <p className="mt-2">
                    <strong>{row.quantity}</strong> delegate(s) —{" "}
                    <strong>
                      {row.currency} {row.totalAmount}
                    </strong>{" "}
                    <span className="text-muted-foreground">
                      ({row.paymentMode})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </p>
                  {row.adminMessage && (
                    <p className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-300">
                      {row.adminMessage}
                    </p>
                  )}
                  {row.receiptUrl && (
                    <a
                      href={row.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-primary hover:underline"
                    >
                      View submitted receipt ({row.offline?.receiptFileName})
                    </a>
                  )}
                  {row.canResumePayment && (
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={resumingId !== null}
                        onClick={() => void handleResumePayment(row)}
                      >
                        {resumingId === row._id && (
                          <Loader2Icon className="size-4 animate-spin" />
                        )}
                        <BanknoteIcon className="size-4" />
                        Resume payment
                      </Button>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ReceiptTextIcon className="size-3" />
                        {row.currency} {row.totalAmount} still due
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
