"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2Icon, Loader2Icon, XCircleIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";

type PaymentSuccessProps = {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
};

export function PaymentSuccess({
  title,
  description,
  backHref,
  backLabel,
}: PaymentSuccessProps) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const paystackReference =
    searchParams.get("reference") ?? searchParams.get("trxref");
  const finalizeStripe = useAction(api.stripeCheckout.finalizeCheckoutSession);
  const finalizePaystack = useAction(
    api.paystackCheckout.finalizeCheckoutSession,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [provider, setProvider] = useState<"stripe" | "paystack" | null>(null);

  useEffect(() => {
    if (!isConvexConfigured()) {
      setError("Convex is not configured.");
      setLoading(false);
      return;
    }

    if (!sessionId && !paystackReference) {
      setError("Missing payment reference.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        if (sessionId) {
          setProvider("stripe");
          const result = await finalizeStripe({ sessionId });
          if (cancelled) return;
          setReferenceNumber(result.referenceNumber ?? null);
          setEmail(result.email ?? null);
          setPaymentStatus(result.paymentStatus);
          return;
        }

        setProvider("paystack");
        const result = await finalizePaystack({
          reference: paystackReference!,
        });
        if (cancelled) return;
        setReferenceNumber(result.referenceNumber ?? null);
        setEmail(result.email ?? null);
        setPaymentStatus(result.paymentStatus);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not verify payment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [finalizePaystack, finalizeStripe, paystackReference, sessionId]);

  const providerLabel = provider === "paystack" ? "Paystack" : "Stripe";

  if (loading) {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <CardHeader className="items-center">
          <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
          <CardTitle className="font-display text-2xl text-primary">
            Confirming payment
          </CardTitle>
          <CardDescription>
            Please wait while we verify your {providerLabel} checkout.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || paymentStatus === "failed") {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <CardHeader className="items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircleIcon className="h-8 w-8" />
          </div>
          <CardTitle className="font-display text-2xl">Payment issue</CardTitle>
          <CardDescription>
            {error || "Payment was not completed. You can try again from the form."}
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button href={backHref}>{backLabel}</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl text-center">
      <CardHeader className="items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2Icon className="h-8 w-8" />
        </div>
        <CardTitle className="font-display text-2xl text-primary">{title}</CardTitle>
        <CardDescription>
          {description}
          {email ? (
            <>
              {" "}
              A confirmation email has been queued to <strong>{email}</strong>.
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {referenceNumber && (
          <p className="text-sm text-muted-foreground">
            Reference:{" "}
            <Badge
              variant="secondary"
              className="font-mono text-base tracking-wider"
            >
              {referenceNumber}
            </Badge>
          </p>
        )}
        {paymentStatus === "pending_payment" && (
          <Alert>
            <AlertTitle>Payment processing</AlertTitle>
            <AlertDescription>
              {providerLabel} confirmed checkout, but your record is still
              updating. Refresh in a moment if you do not receive an email.
            </AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          Questions? Contact{" "}
          <a
            href={`mailto:${EVENT.supportEmail}`}
            className="text-primary hover:underline"
          >
            {EVENT.supportEmail}
          </a>
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <Button href={backHref}>{backLabel}</Button>
      </CardFooter>
    </Card>
  );
}
