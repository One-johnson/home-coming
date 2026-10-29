"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRightIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { TourReceiptUploader } from "@/components/tours/TourReceiptUploader";
import { isConvexConfigured } from "@/lib/convex-config";
import { cn } from "@/lib/utils";

type Submitted = { referenceNumber: string; email: string };

const STATUS_COPY: Record<
  string,
  { label: string; tone: string; hint: string }
> = {
  pending_payment: {
    label: "Awaiting payment",
    tone: "border-amber-300 bg-amber-50 text-amber-900",
    hint: "We have your booking. Transfer the total to the account in your confirmation email (or upload your receipt below) and finance will confirm your tickets.",
  },
  paid: {
    label: "Payment confirmed",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-900",
    hint: "Your tickets are confirmed. Bring your reference number with you on the day.",
  },
  failed: {
    label: "Payment problem",
    tone: "border-red-300 bg-red-50 text-red-900",
    hint: "Finance could not verify this payment. Upload a clear receipt or contact the support address below.",
  },
  mock_paid: {
    label: "Test booking",
    tone: "border-slate-300 bg-slate-50 text-slate-900",
    hint: "This booking was created in test mode and holds no real tickets.",
  },
};

type Order = NonNullable<ReturnType<typeof useOrder>>;

function OrderStatus({ order, email }: { order: Order; email: string }) {
  const status = STATUS_COPY[order.paymentStatus] ?? {
    label: order.paymentStatus.replaceAll("_", " "),
    tone: "border-border bg-muted text-foreground",
    hint: "",
  };

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-background p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Booking reference
          </p>
          <p className="font-mono text-lg font-semibold tracking-wider text-foreground">
            {order.referenceNumber}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.fullName} ·{" "}
            {new Date(order.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Badge variant="outline" className={cn("capitalize", status.tone)}>
          {status.label}
        </Badge>
      </div>

      {status.hint ? (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {status.hint}
        </p>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Tickets</p>
        {order.items.map((item) => (
          <div
            key={`${item.label}-${item.quantity}`}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <span className="text-muted-foreground">
              {item.label} × {item.quantity}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              ${item.unitPrice * item.quantity}
            </span>
          </div>
        ))}
        <Separator />
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Total</span>
          <span className="font-semibold tabular-nums text-primary">
            ${order.totalAmount} {order.currency}
          </span>
        </div>
      </div>

      <Separator />

      <TourReceiptUploader
        referenceNumber={order.referenceNumber}
        email={email}
        receiptUrl={order.receiptUrl}
        variant="inline"
      />
    </div>
  );
}

function useOrder(submitted: Submitted | null) {
  return useQuery(
    api.tourOrders.getStatus,
    submitted
      ? { referenceNumber: submitted.referenceNumber, email: submitted.email }
      : "skip",
  );
}

function LookupConnected() {
  const [referenceNumber, setReferenceNumber] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const order = useOrder(submitted);

  const loading = useMemo(
    () => Boolean(submitted) && order === undefined,
    [submitted, order],
  );

  const canSubmit =
    referenceNumber.trim().length >= 4 && email.trim().includes("@");

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      {!submitted ? (
        <>
          <p className="mx-auto max-w-lg text-center text-sm text-muted-foreground">
            Enter the reference from your booking confirmation and the email you
            booked with. You can check your payment status and upload a receipt
            here any time.
          </p>
          <form
            className="space-y-4 rounded-2xl border border-border bg-background p-5 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) return;
              setSubmitted({
                referenceNumber: referenceNumber.trim(),
                email: email.trim(),
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="status-reference">Reference number</Label>
              <Input
                id="status-reference"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="TUR-XXXXXX"
                autoComplete="off"
                className="font-mono uppercase tracking-wider"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-email">Email used for the booking</Label>
              <Input
                id="status-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              <SearchIcon className="size-4" />
              Check status
            </Button>
          </form>
        </>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 p-8 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Looking up your booking…
        </div>
      ) : null}

      {submitted && !loading && !order ? (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertTitle>No booking found</AlertTitle>
            <AlertDescription>
              Nothing matches that reference and email. Check the reference in
              your confirmation email, and use the email address you booked
              with.
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSubmitted(null)}
          >
            Try another reference
          </Button>
        </div>
      ) : null}

      {submitted && order ? (
        <div className="space-y-4">
          <OrderStatus order={order} email={submitted.email} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setSubmitted(null);
                setReferenceNumber("");
                setEmail("");
              }}
            >
              Check another booking
            </Button>
            <Link
              href="/tours"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "flex-1 justify-center",
              )}
            >
              Back to tours
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TourStatusLookup() {
  if (!isConvexConfigured()) {
    return (
      <Alert className="mx-auto max-w-xl border-amber-200 bg-amber-50 text-amber-900">
        <AlertTitle>Convex required</AlertTitle>
        <AlertDescription>
          Order lookup needs a Convex connection. Booking confirmation still
          works once Convex is configured.
        </AlertDescription>
      </Alert>
    );
  }
  return <LookupConnected />;
}
