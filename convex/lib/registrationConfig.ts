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

export type PaymentGateway = "stripe" | "paystack" | "paypal";

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
    gateway: "paystack",
    regionKey: "ghana",
  },
  "West Africa": {
    price: 20,
    currency: "GHS",
    gateway: "paystack",
    regionKey: "west_africa",
  },
  "UD Africa": {
    price: 20,
    currency: "USD",
    gateway: "stripe",
    regionKey: "rest_of_africa",
  },
  "UD EU": {
    price: 20,
    currency: "EUR",
    gateway: "stripe",
    regionKey: "rest_of_europe",
  },
  "UD EU - UK": {
    price: 20,
    currency: "GBP",
    gateway: "stripe",
    regionKey: "uk",
  },
  "UD EU - Switzerland": {
    price: 20,
    currency: "CHF",
    gateway: "stripe",
    regionKey: "switzerland",
  },
  "UD North America": {
    price: 20,
    currency: "USD",
    gateway: "stripe",
    regionKey: "usa",
  },
  "United Islands": {
    price: 20,
    currency: "USD",
    gateway: "stripe",
    regionKey: "rest_of_world",
  },
  "United Jesus": {
    price: 20,
    currency: "GHS",
    gateway: "paystack",
    regionKey: "ghana",
  },
  "Eschatos International": {
    price: 20,
    currency: "USD",
    gateway: "stripe",
    regionKey: "rest_of_world",
  },
  "Reasonable Service Church": {
    price: 20,
    currency: "GHS",
    gateway: "paystack",
    regionKey: "ghana",
  },
  "Affiliated Denominations": {
    price: 20,
    currency: "GHS",
    gateway: "paystack",
    regionKey: "ghana",
  },
  Other: {
    price: 20,
    currency: "USD",
    gateway: "stripe",
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
  ghana: { label: "Ghana", price: 20, currency: "GHS", gateway: "paystack" },
  west_africa: {
    label: "West Africa",
    price: 20,
    currency: "GHS",
    gateway: "paystack",
  },
  rest_of_africa: {
    label: "Rest of Africa",
    price: 20,
    currency: "USD",
    gateway: "stripe",
  },
  usa: { label: "USA", price: 20, currency: "USD", gateway: "stripe" },
  canada: { label: "Canada", price: 20, currency: "CAD", gateway: "stripe" },
  switzerland: {
    label: "Switzerland",
    price: 20,
    currency: "CHF",
    gateway: "stripe",
  },
  uk: {
    label: "United Kingdom",
    price: 20,
    currency: "GBP",
    gateway: "stripe",
  },
  rest_of_europe: {
    label: "Rest of Europe",
    price: 20,
    currency: "EUR",
    gateway: "stripe",
  },
  rest_of_world: {
    label: "Rest of the World",
    price: 20,
    currency: "USD",
    gateway: "stripe",
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
  const addOnAmount = addOns.reduce((sum, item) => {
    const addOn = ADD_ONS.find((entry) => entry.id === item.id);
    return sum + (addOn?.price ?? 0) * item.quantity;
  }, 0);

  return {
    priceAmount,
    addOnAmount,
    totalAmount: priceAmount + addOnAmount,
    currency: pricing.currency,
    gateway: pricing.gateway,
    regionKey: pricing.regionKey,
  };
}
