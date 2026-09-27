"use client";

import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2Icon } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LinkButton as Button } from "@/components/ui/app-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadFileToConvex } from "@/lib/galleryUpload";
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
  const { sessionToken } = useRepSession();
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

  const [quantity, setQuantity] = useState("1");
  const [gateway, setGateway] = useState<"stripe" | "paypal">("stripe");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<"bank_transfer" | "momo">("momo");
  const [receipt, setReceipt] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isOffline = rep ? isGhsRegion(rep.hubRegion) : true;
  const regionPricing = portalConfig?.regions.find(
    (entry: { region: string; price: number; currency: string }) =>
      entry.region === rep?.hubRegion,
  );
  const unitPrice = regionPricing?.price ?? 0;
  const currency = regionPricing?.currency ?? (isOffline ? "GHS" : "USD");
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));

  const history = useMemo(() => registrations ?? [], [registrations]);

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
      const storageId = await uploadFileToConvex(receipt, () =>
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
          receiptFileName: receipt.name,
          receiptContentType: receipt.type || undefined,
          submittedAt: Date.now(),
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
      const created = await createOnline({
        sessionToken,
        quantity: qty,
        paymentMode: gateway,
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
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
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
                  <RadioGroup
                    value={gateway}
                    onValueChange={(value) =>
                      setGateway(value as "stripe" | "paypal")
                    }
                    className="grid gap-2"
                  >
                    <Label
                      htmlFor="portal-gateway-stripe"
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                    >
                      <RadioGroupItem
                        id="portal-gateway-stripe"
                        value="stripe"
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">Stripe</span>
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          Cards for international payments
                        </span>
                      </span>
                    </Label>
                    <Label
                      htmlFor="portal-gateway-paypal"
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                    >
                      <RadioGroupItem
                        id="portal-gateway-paypal"
                        value="paypal"
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">PayPal</span>
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          PayPal balance or cards
                        </span>
                      </span>
                    </Label>
                  </RadioGroup>
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
            <CardTitle className="text-lg">Purchase history</CardTitle>
            <CardDescription>
              Registration purchases for your hub, newest first.
            </CardDescription>
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
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
