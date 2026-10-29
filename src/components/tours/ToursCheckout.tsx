"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import type { TourPackageDisplay } from "@/lib/tourConfig";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { CountryCodeSelect } from "@/components/forms/CountryCodeSelect";
import { LinkButton as AppButton } from "@/components/ui/app-button";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DENOMINATIONS_BY_GROUP,
  GROUP_OPTIONS,
  formatPrice,
  getGroupPricing,
  shouldShowChurchAffiliation,
} from "@/lib/registrationConfig";
import { preferredIsoForRegion } from "@/lib/countryDialCodes";
import {
  LIBRARY_OF_THE_ANOINTED_NOTE,
  calculateTourTotal,
  resolveTourImage,
  sortTourPackages,
  toTourPackageDisplay,
  tourDayChip,
} from "@/lib/tourConfig";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";
import { compressImageForUpload } from "@/lib/imageCompress";
import { uploadFileToConvex } from "@/lib/galleryUpload";
import {
  TourPackageRow,
  TourQuantityStepper,
} from "@/components/tours/TourPackageRow";
import { useIsCompact } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Checkout steps. Quantities are settled on the page, so the sheet opens on
 * Details — three steps instead of the old four.
 */
type CheckoutStep = "details" | "review" | "payment";
const CHECKOUT_STEPS: CheckoutStep[] = ["details", "review", "payment"];
const STEP_LABELS: Record<CheckoutStep, string> = {
  details: "Details",
  review: "Summary",
  payment: "Payment",
};

const BOOKING_STEPS = [
  {
    title: "Choose your tours",
    detail: "Pick a package and set ticket quantities.",
  },
  {
    title: "Pay by transfer or MoMo",
    detail: "Bank or Mobile Money details appear at checkout.",
  },
  {
    title: "We confirm your ticket",
    detail: "Finance verifies your payment, then your ticket is issued.",
  },
];

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

function ToursCheckoutInner({
  fallbackPackages,
}: {
  fallbackPackages: TourPackageDisplay[];
}) {
  const isCompact = useIsCompact();
  // Live package content: an admin edit or deletion in the dashboard appears
  // here immediately. The manifest only covers the first paint. It is
  // display-only — checkout re-prices by slug on the server.
  const livePackages = useQuery(api.tourPackages.listPublic);
  const packages = useMemo(
    () =>
      sortTourPackages(
        livePackages
          ? livePackages.map((pkg) => toTourPackageDisplay(pkg))
          : fallbackPackages,
      ),
    [livePackages, fallbackPackages],
  );
  const catalog = useQuery(api.registrationCatalog.listPublic);
  const createTourOrder = useMutation(api.tourOrders.create);
  const generateReceiptUploadUrl = useMutation(
    api.tourOrders.generateReceiptUploadUrl,
  );
  const attachReceipt = useMutation(api.tourOrders.attachReceipt);
  const portalConfig = useQuery(api.agcPortal.getPortalConfig);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("details");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+233");
  const [group, setGroup] = useState("");
  const [denomination, setDenomination] = useState("");
  const [church, setChurch] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [receiptStatus, setReceiptStatus] = useState<
    "idle" | "uploading" | "done"
  >("idle");
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const groupOptions = useMemo(() => {
    if (catalog && catalog.length > 0) {
      return catalog.map((item) => item.name);
    }
    return [...GROUP_OPTIONS];
  }, [catalog]);

  const selectedCatalogGroup = catalog?.find((item) => item.name === group);

  const denominationOptions = useMemo(() => {
    if (selectedCatalogGroup) {
      return selectedCatalogGroup.denominations.map((item) => item.name);
    }
    return [...(DENOMINATIONS_BY_GROUP[group] ?? [])];
  }, [group, selectedCatalogGroup]);

  const region = useMemo(() => {
    if (selectedCatalogGroup) return selectedCatalogGroup.regionKey;
    return getGroupPricing(group || "Other").regionKey;
  }, [group, selectedCatalogGroup]);

  const showChurchAffiliation = shouldShowChurchAffiliation(group, denomination);

  const totals = useMemo(
    () => calculateTourTotal(packages, quantities, region),
    [packages, quantities, region],
  );

  const selectedPackages = useMemo(() => {
    return totals.lineItems
      .map((item) => {
        const pkg = packages.find((p) => p._id === item.packageId);
        if (!pkg) return null;
        return { pkg, quantity: item.quantity, unitPrice: item.unitPrice };
      })
      .filter(Boolean) as {
      pkg: TourPackageDisplay;
      quantity: number;
      unitPrice: number;
    }[];
  }, [packages, totals.lineItems]);

  const stepIndex = CHECKOUT_STEPS.indexOf(step);
  const progressValue = ((stepIndex + 1) / CHECKOUT_STEPS.length) * 100;
  const hasSelection = totals.selections.length > 0;
  const ticketCount = totals.selections.reduce((n, s) => n + s.quantity, 0);
  const totalLabel = formatPrice(
    totals.grandTotal,
    totals.currency,
    totals.currencySymbol,
  );
  const showSelectionBar = hasSelection && !sheetOpen && !confirmed;
  const detailsComplete =
    Boolean(fullName.trim()) &&
    Boolean(email.trim()) &&
    Boolean(phone.trim()) &&
    Boolean(countryCode.trim()) &&
    Boolean(group) &&
    Boolean(denomination) &&
    consent;

  const setQuantity = (id: string, quantity: number) => {
    setQuantities((current) => ({
      ...current,
      [id]: Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0,
    }));
  };

  const openCheckout = () => {
    if (!hasSelection) {
      toast.error("Select at least one ticket");
      return;
    }
    setConfirmed(false);
    setError("");
    setStep("details");
    setSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setSheetOpen(open);
    if (!open && !confirmed) {
      setError("");
    }
  };

  const backToTours = () => {
    setSheetOpen(false);
    setStep("details");
    requestAnimationFrame(() => {
      document
        .getElementById("tour-packages")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleGroupChange = (value: string) => {
    setGroup(value);
    setDenomination("");
    if (value && value !== "Other") {
      setChurch("");
    }
    const catalogMatch = catalog?.find((item) => item.name === value);
    const nextPricing = catalogMatch
      ? { defaultCountryCode: catalogMatch.defaultCountryCode }
      : getGroupPricing(value || "Other");
    setCountryCode(nextPricing.defaultCountryCode);
  };

  const goToStep = (target: CheckoutStep) => {
    if (target === "details") {
      setError("");
      setStep(target);
      return;
    }
    if (!hasSelection) {
      toast.error("Select at least one ticket");
      return;
    }
    if ((target === "review" || target === "payment") && !detailsComplete) {
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
        groupName: group,
        denomination,
        church: church || undefined,
        // Slugs, not Convex ids — the server resolves and re-prices from
        // the database so the manifest can never set prices.
        items: totals.selections,
        consent,
        honeypot: honeypot.trim() || undefined,
        mockPayment: false,
      });

      setReferenceNumber(result.referenceNumber);

      // All tour orders pay offline (bank / MoMo). The backend stores the
      // order as pending; the bank details are shown on the payment step.
      setPaymentMessage(
        "Complete your payment via bank transfer or Mobile Money using the account details shown on the payment step. Your tickets will be confirmed once the finance team verifies your payment.",
      );
      setConfirmed(true);
      toast.success("Tour order submitted successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tour order failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Receipt upload runs right after the order is created, so the guest can
   * attach the transfer screenshot while they still have the reference on
   * screen. Compressed client-side (PDFs pass through untouched).
   */
  const handleReceiptFile = async (file: File) => {
    if (!referenceNumber) return;
    setReceiptStatus("uploading");
    try {
      const { file: prepared } = await compressImageForUpload(file);
      const storageId = await uploadFileToConvex(prepared, () =>
        generateReceiptUploadUrl({}),
      );
      await attachReceipt({
        referenceNumber,
        email,
        storageId,
        contentType: prepared.type || file.type || undefined,
      });
      setReceiptName(file.name);
      setReceiptStatus("done");
      toast.success("Receipt uploaded — finance will verify it");
    } catch (err) {
      setReceiptStatus("idle");
      toast.error(
        err instanceof Error ? err.message : "Could not upload that receipt",
      );
    }
  };

  const resetAndClose = () => {
    setSheetOpen(false);
    setConfirmed(false);
    setQuantities({});
    setStep("details");
    setFullName("");
    setEmail("");
    setPhone("");
    setGroup("");
    setDenomination("");
    setChurch("");
    setConsent(false);
    setReferenceNumber(null);
    setPaymentMessage("");
    setReceiptStatus("idle");
    setReceiptName(null);
  };

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-4xl space-y-6 px-1 sm:px-0",
        showSelectionBar && "pb-28",
      )}
    >
      <div id="tour-packages" className="scroll-mt-28 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl text-foreground sm:text-3xl">
            Conference tour packages
          </h2>
          <p className="text-base text-muted-foreground">
            {packages.length} package{packages.length === 1 ? "" : "s"}
            {hasSelection ? ` · ${ticketCount} ticket(s) in cart` : ""}
          </p>
        </div>

        {packages.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {packages.map((pkg) => (
              <a
                key={pkg.slug}
                href={`#tour-${pkg.slug}`}
                className="shrink-0 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <span className="font-semibold">{tourDayChip(pkg)}</span>
                <span className="mx-1.5 text-border">·</span>
                {pkg.label}
              </a>
            ))}
          </div>
        ) : null}

        <ol className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm sm:grid-cols-3 sm:gap-4">
          {BOOKING_STEPS.map((item, index) => (
            <li key={item.title} className="flex gap-2">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span>
                <span className="block font-medium text-foreground">
                  {item.title}
                </span>
                <span className="text-muted-foreground">{item.detail}</span>
              </span>
            </li>
          ))}
        </ol>

        {packages.length === 0 ? (
          <Alert>
            <AlertTitle>No packages available</AlertTitle>
            <AlertDescription>
              Tour packages have not been published yet. Please check back soon.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <TourPackageRow
                key={pkg._id}
                pkg={pkg}
                quantity={quantities[pkg._id] ?? 0}
                onQuantityChange={(qty) => setQuantity(pkg._id, qty)}
              />
            ))}
          </div>
        )}

        <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <span>{LIBRARY_OF_THE_ANOINTED_NOTE}</span>
        </p>
      </div>

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

      {/* The selection bar only exists after a user picks a tour, so it is
          never part of the server render. It is portaled to <body> because
          the animated section wrapper is a containing block for fixed
          children and would otherwise pin it to the section, not the
          viewport. */}
      {showSelectionBar && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur">
              <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground">
                    {ticketCount} ticket{ticketCount === 1 ? "" : "s"}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {totalLabel} ·{" "}
                    {selectedPackages.map((s) => s.pkg.label).join(", ")}
                  </p>
                </div>
                <AppButton className="shrink-0" onClick={openCheckout}>
                  Continue
                </AppButton>
              </div>
            </div>,
            document.body,
          )
        : null}

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
                : "Enter your details, review, then pay."}
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
                        "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-wider",
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

                <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-left">
                  <p className="text-base font-medium text-foreground">
                    Upload your payment receipt
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Already paid? Attach the transfer or MoMo screenshot and
                    finance can confirm your tickets without chasing you. Photo
                    or PDF, up to 8 MB.
                  </p>
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleReceiptFile(file);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={receiptStatus === "uploading"}
                      onClick={() => receiptInputRef.current?.click()}
                    >
                      {receiptStatus === "uploading" ? (
                        <>
                          <Loader2Icon className="size-3.5 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <UploadIcon className="size-3.5" />
                          {receiptStatus === "done"
                            ? "Replace receipt"
                            : "Choose receipt"}
                        </>
                      )}
                    </Button>
                    {receiptStatus === "done" ? (
                      <span className="text-xs font-medium text-primary">
                        Received{receiptName ? ` · ${receiptName}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>

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

            {!confirmed && step === "details" ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-medium text-foreground">
                      Your tickets
                    </p>
                    <button
                      type="button"
                      onClick={backToTours}
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Add another tour
                    </button>
                  </div>
                  {selectedPackages.map(({ pkg, quantity, unitPrice }) => (
                    <div
                      key={pkg._id}
                      className="flex items-center justify-between gap-3 rounded-xl border p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-foreground">
                          {pkg.label}: {pkg.dateLabel}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          ${unitPrice} each · ${unitPrice * quantity}
                        </p>
                      </div>
                      <TourQuantityStepper
                        label={pkg.label}
                        quantity={quantity}
                        onChange={(qty) => setQuantity(pkg._id, qty)}
                      />
                    </div>
                  ))}
                </div>

                <Separator />

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
                        <CountryCodeSelect
                          id="tour-country-code"
                          value={countryCode}
                          onValueChange={setCountryCode}
                          preferredIso={preferredIsoForRegion(region)}
                        />
                        <Input
                          id="tour-phone"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="min-w-0 flex-1"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tour-group">Group *</Label>
                      <Combobox
                        items={groupOptions}
                        value={group || null}
                        onValueChange={(value) =>
                          handleGroupChange((value as string | null) ?? "")
                        }
                      >
                        <ComboboxInput
                          id="tour-group"
                          placeholder="Search group…"
                          className="w-full"
                        />
                        <ComboboxContent>
                          <ComboboxEmpty>No groups found.</ComboboxEmpty>
                          <ComboboxList>
                            {(item) => (
                              <ComboboxItem key={item} value={item}>
                                {item}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tour-denomination">
                        Denomination/Country/Hub *
                      </Label>
                      <Combobox
                        items={denominationOptions}
                        value={denomination || null}
                        disabled={!group}
                        onValueChange={(value) => {
                          const next = (value as string | null) ?? "";
                          setDenomination(next);
                          if (group !== "Other" && next !== "Other") {
                            setChurch("");
                          }
                        }}
                      >
                        <ComboboxInput
                          id="tour-denomination"
                          disabled={!group}
                          placeholder={
                            group
                              ? "Search denomination/country/hub…"
                              : "Select a group first"
                          }
                          className="w-full"
                        />
                        <ComboboxContent>
                          <ComboboxEmpty>No matches found.</ComboboxEmpty>
                          <ComboboxList>
                            {(item) => (
                              <ComboboxItem key={item} value={item}>
                                {item}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </div>
                  </div>
                  {showChurchAffiliation ? (
                    <div className="space-y-2">
                      <Label htmlFor="tour-church">
                        Church / Ministry Affiliation
                      </Label>
                      <Input
                        id="tour-church"
                        placeholder="For guests outside the listed groups"
                        value={church}
                        onChange={(e) => setChurch(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use this if your group or denomination is not in the list
                        (select Other).
                      </p>
                    </div>
                  ) : null}
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
                      Attempt Great Things Conference.
                    </span>
                  </Label>
                </div>
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
                      className="flex gap-3 rounded-xl border bg-muted/30 p-3 text-sm"
                    >
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <Image
                          src={resolveTourImage(pkg)}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <p className="font-medium">
                            {pkg.label}: {pkg.dateLabel}
                          </p>
                          <p className="tabular-nums font-semibold">
                            ${unitPrice * quantity}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {quantity} × ${unitPrice} · {pkg.timeRange}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pkg.meals}
                        </p>
                        {pkg.departurePoint ? (
                          <p className="text-xs text-muted-foreground">
                            Departs from {pkg.departurePoint}
                          </p>
                        ) : null}
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
                  <p>
                    <span className="text-muted-foreground">Group:</span> {group}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Denomination:</span>{" "}
                    {denomination}
                  </p>
                  {church ? (
                    <p>
                      <span className="text-muted-foreground">Affiliation:</span>{" "}
                      {church}
                    </p>
                  ) : null}
                </div>
                <p className="text-lg font-semibold text-primary">
                  Total: {totalLabel}
                </p>
                <button
                  type="button"
                  onClick={backToTours}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Add more tours
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
                    Total: {totalLabel}
                  </p>
                </div>
                <Alert>
                  <AlertTitle>
                    Offline payment — Bank transfer / Mobile Money
                  </AlertTitle>
                  <AlertDescription>
                    Pay the exact total by bank transfer or Mobile Money to the
                    account below. Your tickets are confirmed once the finance
                    team verifies your payment.
                  </AlertDescription>
                </Alert>
                <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-line">
                  {portalConfig?.registrationBankDetails ||
                    "Account details will be shown here once configured by the Super Admin."}
                </div>
                {error && (
                  <Alert className="border-destructive/30 bg-destructive/5">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <button
                  type="button"
                  onClick={backToTours}
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
            ) : step === "details" ? (
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
                  {loading ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    "Submit order"
                  )}
                </AppButton>
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ToursCheckout({
  packages,
}: {
  packages: TourPackageDisplay[];
}) {
  if (!isConvexConfigured()) {
    return <ConvexRequiredMessage />;
  }
  return <ToursCheckoutInner fallbackPackages={packages} />;
}
