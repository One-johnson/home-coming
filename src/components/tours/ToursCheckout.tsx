"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { LinkButton as AppButton } from "@/components/ui/app-button";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  REGION_CONFIG,
  REGION_OPTIONS,
  formatPrice,
  type RegistrationRegion,
} from "@/lib/registrationConfig";
import {
  LIBRARY_OF_THE_ANOINTED_NOTE,
  calculateTourTotal,
  resolveTourImage,
} from "@/lib/tourConfig";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";
import { TourPackageCard } from "@/components/tours/TourPackageCard";
import { useIsCompact } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

type CheckoutStep = "tickets" | "details" | "review" | "payment";
const CHECKOUT_STEPS: CheckoutStep[] = [
  "tickets",
  "details",
  "review",
  "payment",
];
const STEP_LABELS: Record<CheckoutStep, string> = {
  tickets: "Tickets",
  details: "Details",
  review: "Summary",
  payment: "Payment",
};

function ConvexRequiredMessage() {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
      <AlertTitle>Convex required</AlertTitle>
      <AlertDescription>
        Tour ticketing requires Convex. Run{" "}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
          npx convex dev
        </code>{" "}
        to enable checkout and payments.
      </AlertDescription>
    </Alert>
  );
}

function QtyControl({
  label,
  quantity,
  onChange,
}: {
  label: string;
  quantity: number;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        disabled={quantity <= 0}
        onClick={() => onChange(Math.max(0, quantity - 1))}
        aria-label={`Decrease ${label}`}
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums">
        {quantity}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => onChange(quantity + 1)}
        aria-label={`Increase ${label}`}
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function ToursCheckoutInner() {
  const isCompact = useIsCompact();
  const packages = useQuery(api.tourPackages.listPublic);
  const createTourOrder = useMutation(api.tourOrders.create);
  const initiatePaystack = useMutation(api.payments.initiatePaystackPayment);
  const initiatePaypal = useMutation(api.payments.initiatePaypalPayment);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("tickets");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [region, setRegion] = useState<RegistrationRegion>("ghana");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(
    REGION_CONFIG.ghana.defaultCountryCode,
  );
  const [groupName, setGroupName] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");

  const totals = useMemo(
    () => calculateTourTotal(packages ?? [], quantities, region),
    [packages, quantities, region],
  );

  const selectedPackages = useMemo(() => {
    if (!packages) return [];
    return totals.lineItems
      .map((item) => {
        const pkg = packages.find((p) => p._id === item.packageId);
        if (!pkg) return null;
        return { pkg, quantity: item.quantity, unitPrice: item.unitPrice };
      })
      .filter(Boolean) as {
      pkg: Doc<"tourPackages">;
      quantity: number;
      unitPrice: number;
    }[];
  }, [packages, totals.lineItems]);

  const regionConfig = REGION_CONFIG[region];
  const stepIndex = CHECKOUT_STEPS.indexOf(step);
  const progressValue = ((stepIndex + 1) / CHECKOUT_STEPS.length) * 100;
  const hasSelection = totals.selections.length > 0;
  const detailsComplete =
    Boolean(fullName.trim()) &&
    Boolean(email.trim()) &&
    Boolean(phone.trim()) &&
    consent;

  const setQuantity = (id: Id<"tourPackages">, quantity: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0,
    }));
  };

  const openCheckoutForPackage = (packageId: Id<"tourPackages">) => {
    setConfirmed(false);
    setError("");
    setQuantities((current) => ({
      ...current,
      [packageId]: Math.max(1, current[packageId] ?? 0),
    }));
    setStep("tickets");
    setSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open);
    if (!open && !confirmed) {
      setError("");
    }
  };

  const addMoreTours = () => {
    setSheetOpen(false);
    setStep("tickets");
    toast.message("Select another package on the page to add it to your order");
    requestAnimationFrame(() => {
      document
        .getElementById("tour-packages")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleRegionChange = (value: RegistrationRegion) => {
    setRegion(value);
    setCountryCode(REGION_CONFIG[value].defaultCountryCode);
  };

  const goToStep = (target: CheckoutStep) => {
    if (target === "tickets") {
      setError("");
      setStep(target);
      return;
    }
    if (!hasSelection) {
      toast.error("Select at least one ticket");
      return;
    }
    if (
      (target === "review" || target === "payment") &&
      !detailsComplete
    ) {
      toast.error("Complete your details first");
      return;
    }
    setError("");
    setStep(target);
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await createTourOrder({
        fullName,
        email,
        phone,
        countryCode,
        region,
        groupName: groupName || undefined,
        items: totals.selections,
        consent,
        honeypot: honeypot.trim() || undefined,
        mockPayment: true,
      });

      setReferenceNumber(result.referenceNumber);

      if (result.gateway === "paystack") {
        const paymentResult = await initiatePaystack({
          tourOrderId: result.id,
          email,
          amount: result.totalAmount,
          currency: result.currency,
        });
        setPaymentMessage(paymentResult.message ?? "Payment processed.");
      } else {
        const paymentResult = await initiatePaypal({
          tourOrderId: result.id,
          amount: result.totalAmount,
          currency: result.currency,
        });
        setPaymentMessage(paymentResult.message ?? "Payment processed.");
      }

      setConfirmed(true);
      toast.success("Tour order submitted successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Tour order failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setSheetOpen(false);
    setConfirmed(false);
    setQuantities({});
    setStep("tickets");
    setFullName("");
    setEmail("");
    setPhone("");
    setGroupName("");
    setConsent(false);
    setReferenceNumber(null);
    setPaymentMessage("");
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-1 sm:px-0">
      <Alert
        variant="destructive"
        className="border-red-300 bg-red-50 text-red-950 [&>svg]:text-red-700"
      >
        <InfoIcon />
        <AlertTitle className="text-red-900">Library of the Anointed</AlertTitle>
        <AlertDescription className="text-red-900/90">
          {LIBRARY_OF_THE_ANOINTED_NOTE}
        </AlertDescription>
      </Alert>

      <div
        id="tour-packages"
        className="flex flex-wrap items-end justify-between gap-3 scroll-mt-28"
      >
        <div>
          <h2 className="font-display text-xl text-primary">
            Homecoming tour packages
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {packages === undefined
              ? "Loading packages…"
              : `${packages.length} package${packages.length === 1 ? "" : "s"}`}
            {hasSelection
              ? ` · ${totals.selections.reduce((n, s) => n + s.quantity, 0)} ticket(s) in cart`
              : ""}
          </p>
        </div>
        {hasSelection && !sheetOpen ? (
          <Button type="button" onClick={() => setSheetOpen(true)}>
            Continue checkout
          </Button>
        ) : null}
      </div>

      {packages === undefined ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="min-h-[28rem] rounded-2xl" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <Alert>
          <AlertTitle>No packages available</AlertTitle>
          <AlertDescription>
            Tour packages have not been published yet. Please check back soon.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {packages.map((pkg) => (
            <TourPackageCard
              key={pkg._id}
              pkg={pkg}
              selectedQuantity={quantities[pkg._id] ?? 0}
              onSelect={() => openCheckoutForPackage(pkg._id)}
            />
          ))}
        </div>
      )}

      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side={isCompact ? "bottom" : "right"}
          className={cn(
            "flex w-full flex-col gap-0 overflow-hidden p-0",
            isCompact
              ? "max-h-[92dvh] rounded-t-2xl sm:max-w-none"
              : "sm:max-w-xl data-[side=right]:sm:max-w-xl",
          )}
        >
          {isCompact ? (
            <div
              className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
              aria-hidden
            />
          ) : null}

          <SheetHeader className="shrink-0 space-y-1 border-b px-4 py-4 pr-14 sm:px-6">
            <SheetTitle className="font-display text-xl text-primary">
              {confirmed ? "Order confirmed" : "Book your tours"}
            </SheetTitle>
            <SheetDescription>
              {confirmed
                ? "Your tour tickets have been reserved."
                : "Choose tickets, enter your details, review, then pay."}
            </SheetDescription>
          </SheetHeader>

          {!confirmed ? (
            <div className="shrink-0 space-y-2 border-b px-4 py-3 sm:px-6">
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {CHECKOUT_STEPS.map((s, i) => {
                  const active = step === s;
                  const reached = CHECKOUT_STEPS.indexOf(step) >= i;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => goToStep(s)}
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider",
                        active
                          ? "bg-primary text-primary-foreground"
                          : reached
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-muted text-muted-foreground/60",
                      )}
                    >
                      {i + 1}. {STEP_LABELS[s]}
                    </button>
                  );
                })}
              </div>
              <Progress value={progressValue} />
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {error ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {confirmed ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2Icon className="h-7 w-7" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Confirmation queued to <strong>{email}</strong>
                </p>
                {referenceNumber ? (
                  <Badge
                    variant="secondary"
                    className="font-mono text-base tracking-wider"
                  >
                    {referenceNumber}
                  </Badge>
                ) : null}
                {selectedPackages.length > 0 ? (
                  <div className="rounded-lg border bg-muted/40 p-3 text-left text-sm text-muted-foreground">
                    {selectedPackages.map(({ pkg, quantity }) => (
                      <p key={pkg._id}>
                        {pkg.label}: {pkg.dateLabel} × {quantity}
                      </p>
                    ))}
                  </div>
                ) : null}
                {paymentMessage ? (
                  <Alert>
                    <AlertDescription>{paymentMessage}</AlertDescription>
                  </Alert>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  Questions?{" "}
                  <a
                    href={`mailto:${EVENT.supportEmail}`}
                    className="text-primary hover:underline"
                  >
                    {EVENT.supportEmail}
                  </a>
                </p>
              </div>
            ) : null}

            {!confirmed && step === "tickets" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Set ticket quantities. You can add more packages from the tours
                  page anytime.
                </p>
                {(packages ?? []).map((pkg) => {
                  const qty = quantities[pkg._id] ?? 0;
                  const imageSrc = resolveTourImage(pkg);
                  return (
                    <div
                      key={pkg._id}
                      className={cn(
                        "rounded-xl border p-3",
                        qty > 0 ? "border-primary/40 bg-primary/5" : "",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                          <Image
                            src={imageSrc}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">
                                {pkg.label}: {pkg.dateLabel}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {pkg.timeRange} · ${pkg.priceUsd} each
                              </p>
                            </div>
                            <QtyControl
                              label={pkg.label}
                              quantity={qty}
                              onChange={(q) => setQuantity(pkg._id, q)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addMoreTours}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Browse all tours to compare packages
                </button>
              </div>
            ) : null}

            {!confirmed && step === "details" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tour-full-name">Full name</Label>
                  <Input
                    id="tour-full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tour-email">Email</Label>
                    <Input
                      id="tour-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tour-phone">Phone</Label>
                    <div className="flex gap-2">
                      <Input
                        className="w-20"
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        aria-label="Country code"
                      />
                      <Input
                        id="tour-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Region / Country</Label>
                  <Select
                    value={region}
                    onValueChange={(value) =>
                      handleRegionChange(value as RegistrationRegion)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Gateway:{" "}
                    <span className="capitalize">{regionConfig.gateway}</span> ·
                    USD
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tour-group">
                    Group / Organization (optional)
                  </Label>
                  <Input
                    id="tour-group"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                  />
                </div>
                <Label className="flex items-start gap-3">
                  <Checkbox
                    checked={consent}
                    onCheckedChange={(checked) =>
                      setConsent(checked === true)
                    }
                    className="mt-1"
                  />
                  <span className="text-sm text-muted-foreground">
                    I consent to receive event communications about The
                    Homecoming Convention.
                  </span>
                </Label>
              </div>
            ) : null}

            {!confirmed && step === "review" ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Order summary
                  </p>
                  {selectedPackages.map(({ pkg, quantity, unitPrice }) => (
                    <div
                      key={pkg._id}
                      className="overflow-hidden rounded-xl border bg-muted/30 text-sm"
                    >
                      <div className="relative aspect-[16/9] w-full bg-muted">
                        <Image
                          src={resolveTourImage(pkg)}
                          alt={`${pkg.label}: ${pkg.dateLabel}`}
                          fill
                          sizes="(max-width: 640px) 100vw, 28rem"
                          className="object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <div className="flex justify-between gap-2">
                          <p className="font-medium">
                            {pkg.label}: {pkg.dateLabel}
                          </p>
                          <p className="tabular-nums font-semibold">
                            ${unitPrice * quantity}
                          </p>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {quantity} × ${unitPrice} · {pkg.timeRange}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pkg.meals}
                        </p>
                        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                          {pkg.sites.map((site) => (
                            <li key={site}>{site}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Purchaser:</span>{" "}
                    {fullName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Email:</span> {email}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Phone:</span>{" "}
                    {countryCode} {phone}
                  </p>
                </div>
                <p className="text-lg font-semibold text-primary">
                  Total:{" "}
                  {formatPrice(
                    totals.grandTotal,
                    totals.currency,
                    totals.currencySymbol,
                  )}
                </p>
                <button
                  type="button"
                  onClick={addMoreTours}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Add more tours from the tours page
                </button>
              </div>
            ) : null}

            {!confirmed && step === "payment" ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {selectedPackages.map(({ pkg, quantity, unitPrice }) => (
                    <p key={pkg._id}>
                      {pkg.label} × {quantity} — ${unitPrice * quantity}
                    </p>
                  ))}
                  <Separator className="my-2" />
                  <p className="font-semibold text-primary">
                    Total:{" "}
                    {formatPrice(
                      totals.grandTotal,
                      totals.currency,
                      totals.currencySymbol,
                    )}
                  </p>
                  <p className="mt-1">
                    Pay with{" "}
                    <span className="capitalize">{regionConfig.gateway}</span>{" "}
                    in USD
                  </p>
                </div>
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <AlertTitle>Stub mode</AlertTitle>
                  <AlertDescription>
                    Completing will simulate payment until merchant accounts are
                    configured.
                  </AlertDescription>
                </Alert>
                <button
                  type="button"
                  onClick={addMoreTours}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Add more tours before paying
                </button>
              </div>
            ) : null}
          </div>

          <SheetFooter className="shrink-0 border-t bg-background pb-[max(1rem,env(safe-area-inset-bottom))]">
            {confirmed ? (
              <AppButton className="w-full" onClick={resetAndClose}>
                Done
              </AppButton>
            ) : step === "tickets" ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setSheetOpen(false)}
                >
                  Close
                </Button>
                <AppButton
                  className="w-full flex-1"
                  disabled={!hasSelection}
                  onClick={() => setStep("details")}
                >
                  Continue
                </AppButton>
              </div>
            ) : step === "details" ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep("tickets")}
                >
                  <ArrowLeftIcon className="size-3.5" />
                  Back
                </Button>
                <AppButton
                  className="w-full flex-1"
                  disabled={!detailsComplete || !hasSelection}
                  onClick={() => setStep("review")}
                >
                  Review order
                </AppButton>
              </div>
            ) : step === "review" ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep("details")}
                >
                  <ArrowLeftIcon className="size-3.5" />
                  Back
                </Button>
                <AppButton
                  className="w-full flex-1"
                  onClick={() => setStep("payment")}
                >
                  Continue to payment
                </AppButton>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep("review")}
                >
                  <ArrowLeftIcon className="size-3.5" />
                  Back
                </Button>
                <AppButton
                  className="w-full flex-1"
                  disabled={loading || !consent || !hasSelection}
                  onClick={handleSubmit}
                >
                  {loading ? "Processing…" : "Complete purchase"}
                </AppButton>
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ToursCheckout() {
  if (!isConvexConfigured()) {
    return <ConvexRequiredMessage />;
  }
  return <ToursCheckoutInner />;
}
