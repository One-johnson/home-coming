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
  REGION_CONFIG,
  REGION_OPTIONS,
  calculateRegistrationTotal,
  formatPrice,
  type RegistrationRegion,
  type RegistrationType,
} from "@/lib/registrationConfig";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";
import { cn } from "@/lib/utils";

type Step = "type" | "region" | "details" | "payment" | "confirmation";
const STEPS: Step[] = ["type", "region", "details", "payment"];

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
  const [addOns, setAddOns] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [church, setChurch] = useState("");
  const [accommodationInterest, setAccommodationInterest] = useState(false);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");

  const totals = useMemo(
    () => calculateRegistrationTotal(region, ticketQuantity, addOns),
    [region, ticketQuantity, addOns],
  );

  const regionConfig = REGION_CONFIG[region];
  const stepIndex = STEPS.indexOf(step as (typeof STEPS)[number]);
  const progressValue =
    stepIndex >= 0 ? ((stepIndex + 1) / STEPS.length) * 100 : 0;

  const toggleAddOn = (id: string) => {
    setAddOns((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
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
        church: church || undefined,
        ticketQuantity,
        addOns,
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
              <Badge variant="secondary" className="font-mono">
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <Badge
              key={s}
              variant={step === s ? "default" : "secondary"}
              className="uppercase tracking-wider"
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
          <CardFooter>
            <Button onClick={() => setStep("region")}>Continue</Button>
          </CardFooter>
        </Card>
      )}

      {step === "region" && (
        <Card>
          <CardHeader>
            <CardTitle>Country / Region</CardTitle>
            <CardDescription>
              Pricing and payment gateway depend on your region.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="region">Select your region</Label>
              <Select
                value={region}
                onValueChange={(value) => setRegion(value as RegistrationRegion)}
              >
                <SelectTrigger id="region" className="w-full">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {REGION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} —{" "}
                      {formatPrice(
                        REGION_CONFIG[option.value].price,
                        REGION_CONFIG[option.value].currency,
                        REGION_CONFIG[option.value].currencySymbol,
                      )}
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
          <CardFooter className="gap-3">
            <Button variant="outline" onClick={() => setStep("type")}>
              Back
            </Button>
            <Button onClick={() => setStep("details")}>Continue</Button>
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

            <div className="grid gap-4 sm:grid-cols-2">
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
                <Input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="countryCode">Country Code *</Label>
              <Input
                id="countryCode"
                required
                placeholder="+233"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="church">Church / Ministry Affiliation</Label>
              <Input
                id="church"
                value={church}
                onChange={(e) => setChurch(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label>Add-Ons</Label>
              {ADD_ONS.map((addOn) => (
                <Label
                  key={addOn.id}
                  htmlFor={`addon-${addOn.id}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/50"
                >
                  <Checkbox
                    id={`addon-${addOn.id}`}
                    checked={addOns.includes(addOn.id)}
                    onCheckedChange={() => toggleAddOn(addOn.id)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-primary">
                      {addOn.label} — ${addOn.price} USD
                    </p>
                    <p className="text-sm text-muted-foreground">{addOn.description}</p>
                  </div>
                </Label>
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
                {totals.addOnTotal > 0 && <p>Add-ons: ${totals.addOnTotal} USD</p>}
                <Separator className="my-2" />
                <p className="font-semibold text-primary">
                  Total: {formatPrice(totals.grandTotal, totals.currency, totals.currencySymbol)}
                  {totals.addOnTotal > 0 && " + add-ons in USD"}
                </p>
              </CardContent>
            </Card>
          </CardContent>
          <CardFooter className="gap-3">
            <Button variant="outline" onClick={() => setStep("region")}>
              Back
            </Button>
            <Button onClick={() => setStep("payment")}>Continue to Payment</Button>
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
          <CardFooter className="gap-3">
            <Button variant="outline" onClick={() => setStep("details")}>
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={loading || !consent}>
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
