"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeftIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { CountryCodeSelect } from "@/components/forms/CountryCodeSelect";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { preferredIsoForRegion } from "@/lib/countryDialCodes";
import {
  DENOMINATIONS_BY_GROUP,
  GROUP_OPTIONS,
  calculateRegistrationTotal,
  formatPrice,
  getGroupPricing,
  shouldShowChurchAffiliation,
  type PricingConfig,
} from "@/lib/registrationConfig";
import { EVENT, SITE_FEATURES } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";

type Step = "details" | "payment" | "confirmation";
const STEPS = ["details", "payment"] as const;
type WizardStep = (typeof STEPS)[number];
const STEP_LABELS: Record<WizardStep, string> = {
  details: "Details",
  payment: "Payment",
};
function ConvexRequiredMessage() {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
      <AlertTitle>Convex required</AlertTitle>
      <AlertDescription>
        Registration requires Convex. Run{" "}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
          npx convex dev
        </code>{" "}
        to enable registration and payments.
      </AlertDescription>
    </Alert>
  );
}

function RegistrationFormInner() {
  const catalog = useQuery(api.registrationCatalog.listPublic);
  const createRegistration = useMutation(api.registrations.create);
  const portalConfig = useQuery(api.agcPortal.getPortalConfig);

  const [step, setStep] = useState<Step>("details");
  const [furthestStepIndex, setFurthestStepIndex] = useState(0);
  const type = "group" as const;
  const [ticketQuantity, setTicketQuantity] = useState(1);
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
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");

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

  const pricing: PricingConfig = useMemo(() => {
    if (selectedCatalogGroup) {
      return {
        price: selectedCatalogGroup.price,
        currency: selectedCatalogGroup.currency,
        currencySymbol: selectedCatalogGroup.currencySymbol,
        // Legacy stripe/paypal catalog rows resolve to the offline flow.
        gateway: "offline" as const,
        defaultCountryCode: selectedCatalogGroup.defaultCountryCode,
        regionKey: selectedCatalogGroup.regionKey,
      };
    }
    return getGroupPricing(group || "Other");
  }, [group, selectedCatalogGroup]);

  const totals = useMemo(
    () => calculateRegistrationTotal(group || "Other", ticketQuantity, {}),
    [group, ticketQuantity],
  );

  // Prefer live catalog pricing for display totals when available.
  const displayTotals = useMemo(() => {
    const ticketTotal = pricing.price * ticketQuantity;
    return {
      ticketTotal,
      addOnTotal: 0,
      grandTotal: ticketTotal,
      currency: pricing.currency,
      currencySymbol: pricing.currencySymbol,
      gateway: pricing.gateway,
      regionKey: pricing.regionKey,
      addOns: [] as { id: string; quantity: number }[],
    };
  }, [pricing, ticketQuantity]);

  // Every group pays offline now (Stripe/PayPal removed) — bank / MoMo
  // instructions with the exact total, then finance verifies the payment.
  const stepIndex = STEPS.indexOf(step as WizardStep);
  const progressValue =
    stepIndex >= 0 ? ((stepIndex + 1) / STEPS.length) * 100 : 0;
  const showChurchAffiliation = shouldShowChurchAffiliation(
    group,
    denomination,
  );

  const goToStep = (target: WizardStep) => {
    const targetIndex = STEPS.indexOf(target);
    if (targetIndex < 0) return;
    if (targetIndex > furthestStepIndex) {
      toast.message("Complete the current step before continuing");
      return;
    }
    setError("");
    setStep(target);
  };

  const goToNextStep = (target: WizardStep) => {
    const targetIndex = STEPS.indexOf(target);
    if (targetIndex < 0) return;
    setError("");
    setFurthestStepIndex((current) => Math.max(current, targetIndex));
    setStep(target);
  };

  const handleGroupChange = (value: string) => {
    setGroup(value);
    setDenomination("");
    if (value && value !== "Other") {
      setChurch("");
    }
    const catalogMatch = catalog?.find((item) => item.name === value);
    const nextPricing = catalogMatch
      ? {
          currency: catalogMatch.currency,
          defaultCountryCode: catalogMatch.defaultCountryCode,
        }
      : getGroupPricing(value || "Other");
    setCountryCode(nextPricing.defaultCountryCode);
  };

  const validateDetails = () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return false;
    }
    if (!phone.trim() || !countryCode.trim()) {
      toast.error("Phone number is required");
      return false;
    }
    if (!group) {
      toast.error("Please select a group");
      return false;
    }
    if (!denomination) {
      toast.error("Please select a denomination/country/hub");
      return false;
    }
    if (ticketQuantity < 1) {
      toast.error("Ticket quantity must be at least 1");
      return false;
    }
    if (!consent) {
      toast.error("Please accept the consent checkbox to continue.");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateDetails()) {
      setStep("details");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const result = await createRegistration({
        type,
        email,
        phone,
        countryCode,
        region: displayTotals.regionKey,
        group,
        denomination: denomination || undefined,
        church: church || undefined,
        ticketQuantity,
        addOns: SITE_FEATURES.addOnsEnabled ? totals.addOns : [],
        accommodationInterest: false,
        consent,
        honeypot: honeypot.trim() || undefined,
        mockPayment: false,
      });

      setReferenceNumber(result.referenceNumber);

      // All registrations pay offline (bank transfer / MoMo). The backend
      // stores the transaction as pending; the bank details are shown below.
      setPaymentMessage(
        "Complete your payment via bank transfer or Mobile Money using the account details shown above. Your registration will be confirmed once the finance team verifies your payment.",
      );
      setStep("confirmation");
      toast.success("Registration submitted successfully");
    } catch (err) {
      const message = cleanErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (step === "confirmation") {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <CardHeader className="items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2Icon className="h-8 w-8" />
          </div>
          <CardTitle className="font-display text-2xl text-primary">
            Registration Submitted
          </CardTitle>
          <CardDescription>
            Thank you for registering for {EVENT.fullTitle}. A confirmation email
            has been queued to <strong>{email}</strong>.
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
          {paymentMessage && (
            <Alert>
              <AlertDescription>{paymentMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Step {Math.max(stepIndex, 0) + 1} of {STEPS.length}
          </p>
          <div className="flex gap-2">
            {STEPS.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => goToStep(item)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  index === stepIndex
                    ? "bg-primary text-primary-foreground"
                    : index <= furthestStepIndex
                      ? "bg-muted text-foreground"
                      : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {STEP_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <Progress value={progressValue} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "details" && (
        <Card>
          <CardHeader>
            <CardTitle>Registration details</CardTitle>
            <CardDescription>
              Select your group for ticket pricing, then continue to payment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
              aria-hidden
            >
              <Label htmlFor="registration-honeypot">Leave blank</Label>
              <Input
                id="registration-honeypot"
                name="registration-honeypot"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                readOnly
                value={honeypot}
                onFocus={(event) =>
                  event.currentTarget.removeAttribute("readOnly")
                }
                onChange={(event) => setHoneypot(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="group">Group *</Label>
                <Combobox
                  items={groupOptions}
                  value={group || null}
                  onValueChange={(value) =>
                    handleGroupChange((value as string | null) ?? "")
                  }
                >
                  <ComboboxInput
                    id="group"
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
                <Label htmlFor="denomination">Denomination/Country/Hub *</Label>
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
                    id="denomination"
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

            {group ? (
              <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                Ticket price for{" "}
                <span className="font-medium text-foreground">{group}</span>:{" "}
                <span className="font-semibold text-primary">
                  {formatPrice(
                    pricing.price,
                    pricing.currency,
                    pricing.currencySymbol,
                  )}
                </span>{" "}
                each
              </p>
            ) : null}

            {showChurchAffiliation && (
              <div className="space-y-2">
                <Label htmlFor="church">Church / Ministry Affiliation</Label>
                <Input
                  id="church"
                  placeholder="For guests outside the listed groups"
                  value={church}
                  onChange={(e) => setChurch(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use this if your group or denomination is not in the list
                  (select Other).
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ticketQuantity">Ticket Quantity *</Label>
              <Input
                id="ticketQuantity"
                type="number"
                min={1}
                value={ticketQuantity}
                onChange={(e) => setTicketQuantity(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <div className="flex gap-2">
                <CountryCodeSelect
                  id="countryCode"
                  value={countryCode}
                  onValueChange={setCountryCode}
                  preferredIso={preferredIsoForRegion(pricing.regionKey)}
                />
                <Input
                  id="phone"
                  type="tel"
                  required
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="min-w-0 flex-1"
                />
              </div>
            </div>

            <Label className="flex items-start gap-3">
              <Checkbox
                required
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked === true)}
                className="mt-1"
              />
              <span className="text-sm text-muted-foreground">
                I consent to receive event communications about The Homecoming
                Convention.
              </span>
            </Label>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                if (!validateDetails()) return;
                goToNextStep("payment");
              }}
            >
              Continue to Payment
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "payment" && (
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
            <CardDescription>
              Tickets{" "}
              {formatPrice(
                displayTotals.ticketTotal,
                displayTotals.currency,
                displayTotals.currencySymbol,
              )}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>Offline payment — Bank transfer / Mobile Money</AlertTitle>
              <AlertDescription>
                Pay the exact total by bank transfer or Mobile Money to the
                account below. Your registration is confirmed once the finance
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
          </CardContent>
          <CardFooter className="flex-col-reverse gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => goToStep("details")}
            >
              <ArrowLeftIcon className="size-3.5" />
              Back
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void handleSubmit()}
              disabled={loading || !consent}
            >
              {loading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit registration"
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

export function RegistrationForm() {
  if (!isConvexConfigured()) {
    return <ConvexRequiredMessage />;
  }
  return <RegistrationFormInner />;
}
