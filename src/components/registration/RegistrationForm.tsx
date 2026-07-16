"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ADD_ONS,
  DENOMINATIONS_BY_GROUP,
  GROUP_OPTIONS,
  REGION_CONFIG,
  REGION_OPTIONS,
  calculateRegistrationTotal,
  formatPrice,
  shouldShowChurchAffiliation,
  type RegistrationRegion,
  type RegistrationType,
} from "@/lib/registrationConfig";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";
import { cn } from "@/lib/utils";

type Step = "type" | "region" | "details" | "payment" | "confirmation";
const STEPS: Step[] = ["type", "region", "details", "payment"];

function emptyAddOnQuantities() {
  return Object.fromEntries(ADD_ONS.map((addOn) => [addOn.id, 0])) as Record<
    string,
    number
  >;
}

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
  const createRegistration = useMutation(api.registrations.create);
  const initiatePaystack = useMutation(api.payments.initiatePaystackPayment);
  const initiatePaypal = useMutation(api.payments.initiatePaypalPayment);

  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<RegistrationType>("individual");
  const [region, setRegion] = useState<RegistrationRegion>("ghana");
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [addOnQuantities, setAddOnQuantities] = useState(emptyAddOnQuantities);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(
    REGION_CONFIG.ghana.defaultCountryCode,
  );
  const [group, setGroup] = useState("");
  const [denomination, setDenomination] = useState("");
  const [church, setChurch] = useState("");
  const [accommodationInterest, setAccommodationInterest] = useState(false);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");

  const totals = useMemo(
    () => calculateRegistrationTotal(region, ticketQuantity, addOnQuantities),
    [region, ticketQuantity, addOnQuantities],
  );

  const regionConfig = REGION_CONFIG[region];
  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);
  const progressValue =
    stepIndex >= 0 ? ((stepIndex + 1) / STEPS.length) * 100 : 0;
  const showChurchAffiliation = shouldShowChurchAffiliation(
    group,
    denomination,
  );
  const denominationOptions = DENOMINATIONS_BY_GROUP[group] ?? [];

  const setAddOnQuantity = (id: string, quantity: number) => {
    setAddOnQuantities((current) => ({
      ...current,
      [id]: Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0,
    }));
  };

  const handleRegionChange = (value: RegistrationRegion) => {
    setRegion(value);
    setCountryCode(REGION_CONFIG[value].defaultCountryCode);
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await createRegistration({
        type,
        fullName: type === "individual" ? fullName : undefined,
        email,
        phone,
        countryCode,
        region,
        group: group || undefined,
        denomination: denomination || undefined,
        church: church || undefined,
        ticketQuantity,
        addOns: totals.addOns,
        accommodationInterest,
        priceAmount: totals.ticketTotal,
        addOnAmount: totals.addOnTotal,
        totalAmount: totals.grandTotal,
        currency: totals.currency,
        gateway: totals.gateway,
        consent,
        honeypot: honeypot.trim() || undefined,
        mockPayment: true,
      });

      setReferenceNumber(result.referenceNumber);

      if (totals.gateway === "paystack") {
        const paymentResult = await initiatePaystack({
          registrationId: result.id,
          email,
          amount: totals.grandTotal,
          currency: totals.currency,
        });
        setPaymentMessage(paymentResult.message ?? "Payment processed.");
      } else {
        const paymentResult = await initiatePaypal({
          registrationId: result.id,
          amount: totals.grandTotal,
          currency: totals.currency,
        });
        setPaymentMessage(paymentResult.message ?? "Payment processed.");
      }

      setStep("confirmation");
      toast.success("Registration submitted successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
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
          <p className="text-sm text-muted-foreground">
            Questions? Contact{" "}
            <a href={`mailto:${EVENT.supportEmail}`} className="text-primary hover:underline">
              {EVENT.supportEmail}
            </a>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-1 sm:space-y-6 sm:px-0">
      <div className="space-y-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STEPS.map((s, i) => (
            <Badge
              key={s}
              variant={step === s ? "default" : "secondary"}
              className="shrink-0 uppercase tracking-wider"
            >
              {i + 1}. {s}
            </Badge>
          ))}
        </div>
        <Progress value={progressValue} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "type" && (
        <Card>
          <CardHeader>
            <CardTitle>Registration Type</CardTitle>
            <CardDescription>
              Choose how you would like to register for the convention.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={type}
              onValueChange={(value) => setType(value as RegistrationType)}
              className="grid gap-4 sm:grid-cols-2"
            >
              {(["individual", "group"] as RegistrationType[]).map((option) => (
                <Label
                  key={option}
                  htmlFor={`type-${option}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-5 transition",
                    type === option
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30",
                  )}
                >
                  <RadioGroupItem value={option} id={`type-${option}`} className="mt-1" />
                  <div>
                    <p className="font-semibold capitalize text-primary">{option}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {option === "individual"
                        ? "Register for yourself with full attendee details."
                        : "Ticket-based bulk registration. Names not required at purchase."}
                    </p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
          <CardFooter className="flex-col gap-3 sm:flex-row">
            <Button className="w-full sm:w-auto" onClick={() => setStep("region")}>
              Continue
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "region" && (
        <Card>
          <CardHeader>
            <CardTitle>Country / Region</CardTitle>
            <CardDescription>
              Select your region for payment routing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="region">Select your region</Label>
              <Select
                value={region}
                onValueChange={(value) =>
                  handleRegionChange(value as RegistrationRegion)
                }
              >
                <SelectTrigger id="region" className="w-full">
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
            </div>
            <p className="text-sm text-muted-foreground">
              Payment via{" "}
              <Badge variant="outline" className="capitalize">
                {regionConfig.gateway}
              </Badge>
            </p>
          </CardContent>
          <CardFooter className="flex-col-reverse gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setStep("type")}
            >
              Back
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setStep("details")}
            >
              Continue
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "details" && (
        <Card>
          <CardHeader>
            <CardTitle>Your Details</CardTitle>
            <CardDescription>
              Tell us who is attending and any add-ons you need.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0" aria-hidden>
              <Label htmlFor="registration-honeypot">Leave blank</Label>
              <Input
                id="registration-honeypot"
                name="registration-honeypot"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                readOnly
                value={honeypot}
                onFocus={(event) => event.currentTarget.removeAttribute("readOnly")}
                onChange={(event) => setHoneypot(event.target.value)}
              />
            </div>

            {type === "individual" && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

            {type === "group" && (
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
            )}

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
                <Input
                  id="countryCode"
                  required
                  aria-label="Country code"
                  placeholder="+233"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-24 shrink-0 sm:w-28"
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="group">Group</Label>
                <Select
                  value={group || null}
                  onValueChange={(value) => {
                    const next = value ?? "";
                    setGroup(next);
                    setDenomination("");
                    if (next && next !== "Other") {
                      setChurch("");
                    }
                  }}
                >
                  <SelectTrigger id="group" className="w-full">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="denomination">Denomination</Label>
                <Select
                  value={denomination || null}
                  disabled={!group}
                  onValueChange={(value) => {
                    const next = value ?? "";
                    setDenomination(next);
                    if (group !== "Other" && next !== "Other") {
                      setChurch("");
                    }
                  }}
                >
                  <SelectTrigger id="denomination" className="w-full">
                    <SelectValue
                      placeholder={
                        group ? "Select denomination" : "Select a group first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {denominationOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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

            <div className="space-y-3">
              <div>
                <Label>Add-Ons</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose quantities independently from ticket count.
                </p>
              </div>
              {ADD_ONS.map((addOn) => (
                <div
                  key={addOn.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-primary">
                      {addOn.label} — ${addOn.price} USD each
                    </p>
                    <p className="text-sm text-muted-foreground">{addOn.description}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:w-36">
                    <Label htmlFor={`addon-qty-${addOn.id}`} className="sr-only">
                      {addOn.label} quantity
                    </Label>
                    <Input
                      id={`addon-qty-${addOn.id}`}
                      type="number"
                      min={0}
                      value={addOnQuantities[addOn.id] ?? 0}
                      onChange={(e) =>
                        setAddOnQuantity(addOn.id, Number(e.target.value))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <Label className="flex items-center gap-3">
              <Checkbox
                checked={accommodationInterest}
                onCheckedChange={(checked) =>
                  setAccommodationInterest(checked === true)
                }
              />
              <span className="text-sm text-muted-foreground">
                I am interested in booking accommodation
              </span>
            </Label>

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

            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Tickets ({ticketQuantity}):{" "}
                  {formatPrice(totals.ticketTotal, totals.currency, totals.currencySymbol)}
                </p>
                {totals.addOns.map((item) => {
                  const addOn = ADD_ONS.find((entry) => entry.id === item.id);
                  if (!addOn) return null;
                  return (
                    <p key={item.id}>
                      {addOn.label} × {item.quantity}: ${addOn.price * item.quantity} USD
                    </p>
                  );
                })}
                <Separator className="my-2" />
                <p className="font-semibold text-primary">
                  Total: {formatPrice(totals.grandTotal, totals.currency, totals.currencySymbol)}
                  {totals.addOnTotal > 0 && " + add-ons in USD"}
                </p>
              </CardContent>
            </Card>
          </CardContent>
          <CardFooter className="flex-col-reverse gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setStep("region")}
            >
              Back
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => setStep("payment")}
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
              You will be routed to{" "}
              <span className="capitalize font-medium">{regionConfig.gateway}</span>{" "}
              for payment in {regionConfig.currency}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertTitle>Stub mode</AlertTitle>
              <AlertDescription>
                Clicking complete will simulate a successful payment and store your
                registration until merchant accounts are configured.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex-col-reverse gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setStep("details")}
            >
              Back
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={loading || !consent}
            >
              {loading ? "Processing..." : "Complete Registration"}
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
