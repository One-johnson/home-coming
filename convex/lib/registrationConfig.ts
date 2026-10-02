export type RegistrationRegion =
  | "ghana"
  | "west_africa"
  | "rest_of_africa"
  | "usa"
  | "canada"
  | "switzerland"
  | "uk"
  | "rest_of_europe"
  | "rest_of_world";

/**
 * Online gateways (Stripe, PayPal) were removed — every region pays offline
 * (bank / MoMo instructions with receipt verification in the admin console).
 * Kept as a union with the historical literals so legacy rows still typecheck.
 */
export type PaymentGateway = "offline";

export type GroupPricing = {
  price: number;
  currency: string;
  gateway: PaymentGateway;
  regionKey: RegistrationRegion;
};

/** Ticket pricing by registration Group (Homecoming documents). */
export const GROUP_PRICING: Record<string, GroupPricing> = {
  Ghana: {
    price: 20,
    currency: "GHS",
    gateway: "offline",
    regionKey: "ghana",
  },
  "West Africa": {
    price: 20,
    currency: "GHS",
    gateway: "offline",
    regionKey: "west_africa",
  },
  "UD Africa": {
    price: 20,
    currency: "USD",
    gateway: "offline",
    regionKey: "rest_of_africa",
  },
  "UD EU": {
    price: 20,
    currency: "EUR",
    gateway: "offline",
    regionKey: "rest_of_europe",
  },
  "UD EU - UK": {
    price: 20,
    currency: "GBP",
    gateway: "offline",
    regionKey: "uk",
  },
  "UD EU - Switzerland": {
    price: 20,
    currency: "CHF",
    gateway: "offline",
    regionKey: "switzerland",
  },
  "UD North America": {
    price: 20,
    currency: "USD",
    gateway: "offline",
    regionKey: "usa",
  },
  "United Islands": {
    price: 20,
    currency: "USD",
    gateway: "offline",
    regionKey: "rest_of_world",
  },
  "United Jesus": {
    price: 20,
    currency: "GHS",
    gateway: "offline",
    regionKey: "ghana",
  },
  "Eschatos International": {
    price: 20,
    currency: "USD",
    gateway: "offline",
    regionKey: "rest_of_world",
  },
  "Reasonable Service Church": {
    price: 20,
    currency: "GHS",
    gateway: "offline",
    regionKey: "ghana",
  },
  "Affiliated Denominations": {
    price: 20,
    currency: "GHS",
    gateway: "offline",
    regionKey: "ghana",
  },
  Other: {
    price: 20,
    currency: "USD",
    gateway: "offline",
    regionKey: "rest_of_world",
  },
};

/** Kept for tours checkout. */
export const REGION_CONFIG: Record<
  RegistrationRegion,
  {
    label: string;
    price: number;
    currency: string;
    gateway: PaymentGateway;
  }
> = {
  ghana: { label: "Ghana", price: 20, currency: "GHS", gateway: "offline" },
  west_africa: {
    label: "West Africa",
    price: 20,
    currency: "GHS",
    gateway: "offline",
  },
  rest_of_africa: {
    label: "Rest of Africa",
    price: 20,
    currency: "USD",
    gateway: "offline",
  },
  usa: { label: "USA", price: 20, currency: "USD", gateway: "offline" },
  canada: { label: "Canada", price: 20, currency: "CAD", gateway: "offline" },
  switzerland: {
    label: "Switzerland",
    price: 20,
    currency: "CHF",
    gateway: "offline",
  },
  uk: {
    label: "United Kingdom",
    price: 20,
    currency: "GBP",
    gateway: "offline",
  },
  rest_of_europe: {
    label: "Rest of Europe",
    price: 20,
    currency: "EUR",
    gateway: "offline",
  },
  rest_of_world: {
    label: "Rest of the World",
    price: 20,
    currency: "USD",
    gateway: "offline",
  },
};

export const ADD_ONS = [
  { id: "vip_meals", label: "VIP Meals", price: 100 },
  { id: "ministers_grill", label: "Ministers Grill", price: 30 },
] as const;

export function getGroupPricing(group: string): GroupPricing {
  return GROUP_PRICING[group] ?? GROUP_PRICING.Other;
}

export function calculateRegistrationAmounts(
  group: string,
  ticketQuantity: number,
  addOns: { id: string; quantity: number }[],
) {
  const pricing = getGroupPricing(group);
  const priceAmount = pricing.price * ticketQuantity;
  // Add-ons are temporarily disabled — ignore any submitted selections.
  void addOns;
  const addOnAmount = 0;

  return {
    priceAmount,
    addOnAmount,
    totalAmount: priceAmount + addOnAmount,
    currency: pricing.currency,
    gateway: pricing.gateway,
    regionKey: pricing.regionKey,
  };
}
