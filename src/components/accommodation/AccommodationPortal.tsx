"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { HOUSING_TYPES, type HousingType } from "@/lib/registrationConfig";
import { buildCheckoutUrls } from "@/lib/stripeCheckout";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type CheckoutGateway = "stripe" | "paystack";

function ConvexRequiredMessage() {
  return (
    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
      <AlertTitle>Convex required</AlertTitle>
      <AlertDescription>
        Accommodation booking requires Convex. Run{" "}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
          npx convex dev
        </code>{" "}
        to enable this feature.
      </AlertDescription>
    </Alert>
  );
}

function AccommodationPortalInner() {
  const housing = useQuery(api.housing.listHousing);
  const hotels = useQuery(api.content.listHotels);
  const createBooking = useMutation(api.housing.createBooking);
  const createCheckout = useAction(api.stripeCheckout.createCheckoutSession);
  const createPaystackCheckout = useAction(
    api.paystackCheckout.createCheckoutSession,
  );

  const [selectedType, setSelectedType] = useState<HousingType>("condo");
  const [gateway, setGateway] = useState<CheckoutGateway>("stripe");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [checkIn, setCheckIn] = useState<string>(EVENT.checkInDate);
  const [checkOut, setCheckOut] = useState<string>(EVENT.checkOutDate);
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  const housingConfig = HOUSING_TYPES[selectedType];
  const selectedHousing = housing?.find((h) => h.type === selectedType);
  const housingReady = housing !== undefined;
  const canPay =
    housingReady &&
    Boolean(selectedHousing) &&
    Boolean(guestName.trim()) &&
    Boolean(guestEmail.trim()) &&
    Boolean(guestPhone.trim());

  const handleBooking = async () => {
    if (!housingReady) {
      const message = "Housing options are still loading. Try again in a moment.";
      setError(message);
      toast.error(message);
      return;
    }

    if (!selectedHousing) {
      const message =
        "Campus housing is not set up yet. Ask an admin to seed housing options.";
      setError(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await createBooking({
        housingId: selectedHousing._id,
        housingType: selectedType,
        guestName,
        guestEmail,
        guestPhone,
        checkIn,
        checkOut,
        guests,
        notes: notes || undefined,
        gateway,
        honeypot: honeypot.trim() || undefined,
        mockPayment: false,
      });

      const urls = buildCheckoutUrls("/accommodation");

      if (gateway === "paystack") {
        const paymentResult = await createPaystackCheckout({
          type: "booking",
          recordId: result.id,
          callbackUrl: urls.paystackCallbackUrl,
        });

        if (paymentResult.mode === "checkout") {
          window.location.href = paymentResult.url;
          return;
        }

        setReferenceNumber(result.referenceNumber);
        setPaymentMessage(
          paymentResult.message ?? "Payment processed via Paystack.",
        );
        setConfirmed(true);
        toast.success("Accommodation booked successfully");
        return;
      }

      const paymentResult = await createCheckout({
        type: "booking",
        recordId: result.id,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
      });

      if (paymentResult.mode === "checkout") {
        window.location.href = paymentResult.url;
        return;
      }

      setReferenceNumber(result.referenceNumber);
      setPaymentMessage(paymentResult.message ?? "Payment processed.");
      setConfirmed(true);
      toast.success(
        paymentResult.message ?? "Accommodation booked successfully",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Booking failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (confirmed) {
    return (
      <Card className="mx-auto max-w-2xl text-center">
        <CardHeader className="items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2Icon className="h-8 w-8" />
          </div>
          <CardTitle className="font-display text-2xl text-primary">
            Booking Confirmed
          </CardTitle>
          <CardDescription>
            Your campus housing booking has been recorded. A confirmation email has
            been queued to <strong>{guestEmail}</strong>.
          </CardDescription>
        </CardHeader>
        {referenceNumber && (
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Reference:{" "}
              <Badge
                variant="secondary"
                className="font-mono text-base tracking-wider"
              >
                {referenceNumber}
              </Badge>
            </p>
            {paymentMessage && (
              <Alert>
                <AlertDescription>{paymentMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Tabs defaultValue="campus" className="w-full space-y-8">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1">
        <TabsTrigger value="campus" className="min-h-11 px-2 text-sm sm:text-base">
          Campus Housing
        </TabsTrigger>
        <TabsTrigger value="hotels" className="min-h-11 px-2 text-sm sm:text-base">
          Preferred Hotels
        </TabsTrigger>
      </TabsList>

      <TabsContent value="campus">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="font-display text-xl text-primary">Select Housing Type</h2>
            {(Object.keys(HOUSING_TYPES) as HousingType[]).map((type) => {
              const config = HOUSING_TYPES[type];
              const unit = housing?.find((h) => h.type === type);
              const available = unit
                ? unit.capacityLimit - unit.booked
                : config.capacityLimit;

              return (
                <Card
                  key={type}
                  className={cn(
                    "cursor-pointer transition",
                    selectedType === type
                      ? "border-primary ring-2 ring-primary/20"
                      : "hover:border-primary/30",
                  )}
                  onClick={() => setSelectedType(type)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="text-base">{config.label}</CardTitle>
                      <Badge variant="outline">${config.pricePerStay}/stay</Badge>
                    </div>
                    <CardDescription>{config.notes}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {available} of {config.capacityLimit} available
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Book {housingConfig.label}</CardTitle>
              <CardDescription>
                Complete your campus accommodation reservation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0" aria-hidden>
                <Label htmlFor="accommodation-honeypot">Leave blank</Label>
                <Input
                  id="accommodation-honeypot"
                  name="accommodation-honeypot"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  readOnly
                  value={honeypot}
                  onFocus={(event) => event.currentTarget.removeAttribute("readOnly")}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="guestName">Full Name *</Label>
                <Input
                  id="guestName"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guestEmail">Email *</Label>
                <Input
                  id="guestEmail"
                  type="email"
                  required
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guestPhone">Phone *</Label>
                <Input
                  id="guestPhone"
                  type="tel"
                  required
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="checkIn">Check-in</Label>
                  <Input
                    id="checkIn"
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checkOut">Check-out</Label>
                  <Input
                    id="checkOut"
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="guests">Number of Guests</Label>
                <Input
                  id="guests"
                  type="number"
                  min={1}
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Special Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {housingReady && !selectedHousing && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                  <AlertTitle>Housing unavailable</AlertTitle>
                  <AlertDescription>
                    Campus housing options have not been seeded in Convex yet.
                    Seed from the admin dashboard, then try again.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <Label>Payment method</Label>
                <RadioGroup
                  value={gateway}
                  onValueChange={(value) =>
                    setGateway(value as CheckoutGateway)
                  }
                  className="grid gap-2"
                >
                  <Label
                    htmlFor="housing-gateway-stripe"
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                  >
                    <RadioGroupItem
                      id="housing-gateway-stripe"
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
                    htmlFor="housing-gateway-paystack"
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                  >
                    <RadioGroupItem
                      id="housing-gateway-paystack"
                      value="paystack"
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Paystack</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        Mobile Money and cards (Africa) — mock until keys are
                        added
                      </span>
                    </span>
                  </Label>
                </RadioGroup>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="space-y-1 pt-4">
                  <p className="font-semibold text-primary">
                    Total: $
                    {selectedHousing?.pricePerStay ?? housingConfig.pricePerStay}{" "}
                    USD per stay
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {gateway === "stripe"
                      ? "You will be redirected to Stripe Checkout."
                      : "You will be redirected to Paystack Checkout."}
                  </p>
                </CardContent>
              </Card>
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                className="w-full"
                onClick={() => void handleBooking()}
                disabled={loading || !canPay}
              >
                {loading ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    {gateway === "stripe" ? "Redirecting…" : "Processing…"}
                  </>
                ) : !housingReady ? (
                  "Loading housing..."
                ) : !selectedHousing ? (
                  "Housing unavailable"
                ) : gateway === "paystack" ? (
                  "Book & Pay with Paystack"
                ) : (
                  "Book & Pay with Stripe"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="hotels">
        <div className="grid gap-6 md:grid-cols-2">
          {(hotels ?? []).map((hotel) => (
            <Card key={hotel._id}>
              <CardHeader>
                <CardTitle>{hotel.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-primary">Contact</p>
                  <p className="text-muted-foreground">{hotel.contact ?? "Coming soon"}</p>
                </div>
                <Separator />
                <div>
                  <p className="font-medium text-primary">Rate</p>
                  <p className="text-muted-foreground">{hotel.rate ?? "To be confirmed"}</p>
                </div>
                <Separator />
                <div>
                  <p className="font-medium text-primary">Location</p>
                  <p className="text-muted-foreground">{hotel.distance ?? "To be confirmed"}</p>
                </div>
                <Separator />
                <div>
                  <p className="font-medium text-primary">Rooms & capacity</p>
                  <p className="text-muted-foreground">
                    {hotel.instructions ?? "Details coming soon"}
                  </p>
                </div>
                {hotel.discountCode && (
                  <>
                    <Separator />
                    <div>
                      <p className="font-medium text-primary">Discount Code</p>
                      <Badge variant="outline" className="text-accent">
                        {hotel.discountCode}
                      </Badge>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
          {!hotels?.length && (
            <p className="text-muted-foreground">Preferred hotel details coming soon.</p>
          )}
        </div>
      </TabsContent>

      <p className="text-center text-sm text-muted-foreground">
        Need help? Email{" "}
        <a href={`mailto:${EVENT.supportEmail}`} className="text-primary hover:underline">
          {EVENT.supportEmail}
        </a>
      </p>
    </Tabs>
  );
}

export function AccommodationPortal() {
  if (!isConvexConfigured()) {
    return <ConvexRequiredMessage />;
  }
  return <AccommodationPortalInner />;
}
