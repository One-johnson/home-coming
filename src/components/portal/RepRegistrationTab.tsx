"use client";

import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BanknoteIcon,
  CircleCheckIcon,
  DownloadIcon,
  ClipboardListIcon,
  Loader2Icon,
  ReceiptTextIcon,
  UserXIcon,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton as Button } from "@/components/ui/app-button";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  // Which history row is resuming Stripe checkout (resume-payment flow).
  const [resumingId, setResumingId] = useState<string | null>(null);

  const isOffline = rep ? isGhsRegion(rep.hubRegion) : true;
  const regionPricing = portalConfig?.regions.find(
    (entry: { region: string; price: number; currency: string }) =>
      entry.region === rep?.hubRegion,
  );
  const unitPrice = regionPricing?.price ?? 0;
  const currency = regionPricing?.currency ?? (isOffline ? "GHS" : "USD");
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));

  const history = useMemo(() => registrations ?? [], [registrations]);

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
      await submitOffline({
        sessionToken,
        quantity: qty,
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
      toast.success(
        "Receipt submitted — finance will review it and email you the outcome.",
      );
      setReceipt(null);
      setAmountPaid("");
      setPaymentRef("");
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      {/* Registration summary — totals across every purchase. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <ClipboardListIcon className="size-3.5 text-gold-dark" />
              Total registrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {summary.count}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {summary.paid + summary.pending} delegate
              {summary.paid + summary.pending === 1 ? "" : "s"} in total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <CircleCheckIcon className="size-3.5 text-gold-dark" />
              Total registered / booked (paid)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
              {summary.paid}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {currency} {summary.paidAmount} confirmed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <UserXIcon className="size-3.5 text-gold-dark" />
              Total reserved (awaiting payment)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              {summary.pending}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {currency} {summary.pendingAmount} outstanding
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Register delegates</CardTitle>
            <CardDescription>
              {rep
                ? `${rep.hubName} — ${AGC_REGION_LABELS[rep.hubRegion as keyof typeof AGC_REGION_LABELS] ?? rep.hubRegion}`
                : "Loading…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Price per delegate:</span>{" "}
                <strong>
                  {currency} {unitPrice}
                </strong>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Attendee names are not needed for registration — only the number
                of delegates.
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="reg-qty">Number of delegates</Label>
              <Input
                id="reg-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <p className="text-sm">
              <span className="text-muted-foreground">Total:</span>{" "}
              <strong>
                {currency} {unitPrice * qty}
              </strong>
            </p>

            {isOffline ? (
              <form className="space-y-4" onSubmit={handleOfflineSubmit}>
                <Alert>
                  <AlertTitle>Offline payment (GHS)</AlertTitle>
                  <AlertDescription>
                    Pay {currency} {unitPrice * qty} by bank transfer or mobile
                    money to the account below, then upload your receipt.
                  </AlertDescription>
                </Alert>
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
                      value={amountPaid || String(unitPrice * qty)}
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Defaults to {currency} {unitPrice * qty} — the exact total
                      for {qty} delegate{qty === 1 ? "" : "s"}. Payments must
                      match the reservation.
                    </p>
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
                <div className="space-y-2">
                  <Label htmlFor="off-receipt">Payment receipt</Label>
                  <Input
                    ref={fileInputRef}
                    id="off-receipt"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    required
                    onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    PDF, JPG or PNG. Finance reviews receipts manually.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2Icon className="size-4 animate-spin" />}
                  {loading ? "Submitting…" : "Submit for review"}
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleOnlineSubmit}>
                <div className="space-y-2">
                  <Label>Payment method</Label>
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
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2Icon className="size-4 animate-spin" />}
                  {loading
                    ? "Redirecting…"
                    : `Pay ${currency} ${unitPrice * qty} online`}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Purchase history</CardTitle>
                <CardDescription>
                  Registration purchases for your hub, newest first.
                </CardDescription>
              </div>
              {(registrations?.length ?? 0) > 0 && (
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
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No registrations yet.
              </p>
            )}
            {history.map((row: RegistrationRow) => {
              const status = paymentStatusMeta(row.paymentStatus);
              return (
                <div
                  key={row._id}
                  className="rounded-lg border p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs tracking-wider">
                      {row.referenceNumber || "(pending)"}
                    </span>
                    <Badge variant="outline" className={status.className}>
                      {status.label}
                    </Badge>
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
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
