export type PaymentGateway = "stripe" | "paystack" | "paypal";

export type RegistrationType = "individual" | "group";

/** Kept for tours and legacy admin filters. */
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

export interface PricingConfig {
  price: number;
  currency: string;
  currencySymbol: string;
  gateway: PaymentGateway;
  defaultCountryCode: string;
  /** Stored on registration.region for payments / admin filters. */
  regionKey: RegistrationRegion;
}

/**
 * Ticket pricing by registration Group (from Homecoming documents).
 * Add-ons remain USD and are selected on the next step.
 */
export const GROUP_PRICING: Record<string, PricingConfig> = {
  Ghana: {
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
  },
  "West Africa": {
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "west_africa",
  },
  "UD Africa": {
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_africa",
  },
  "UD EU": {
    price: 20,
    currency: "EUR",
    currencySymbol: "€",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_europe",
  },
  "UD EU - UK": {
    price: 20,
    currency: "GBP",
    currencySymbol: "£",
    gateway: "stripe",
    defaultCountryCode: "+44",
    regionKey: "uk",
  },
  "UD EU - Switzerland": {
    price: 20,
    currency: "CHF",
    currencySymbol: "CHF",
    gateway: "stripe",
    defaultCountryCode: "+41",
    regionKey: "switzerland",
  },
  "UD North America": {
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+1",
    regionKey: "usa",
  },
  "United Islands": {
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_world",
  },
  "United Jesus": {
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
  },
  "Eschatos International": {
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_world",
  },
  "Reasonable Service Church": {
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
  },
  "Affiliated Denominations": {
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
    regionKey: "ghana",
  },
  Other: {
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_world",
  },
};

export const REGION_CONFIG: Record<
  RegistrationRegion,
  {
    label: string;
    price: number;
    currency: string;
    currencySymbol: string;
    gateway: PaymentGateway;
    defaultCountryCode: string;
  }
> = {
  ghana: {
    label: "Ghana",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
  },
  west_africa: {
    label: "West Africa",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
    defaultCountryCode: "+233",
  },
  rest_of_africa: {
    label: "Rest of Africa",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
  },
  usa: {
    label: "USA",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+1",
  },
  canada: {
    label: "Canada",
    price: 20,
    currency: "CAD",
    currencySymbol: "CA$",
    gateway: "stripe",
    defaultCountryCode: "+1",
  },
  switzerland: {
    label: "Switzerland",
    price: 20,
    currency: "CHF",
    currencySymbol: "CHF",
    gateway: "stripe",
    defaultCountryCode: "+41",
  },
  uk: {
    label: "United Kingdom",
    price: 20,
    currency: "GBP",
    currencySymbol: "£",
    gateway: "stripe",
    defaultCountryCode: "+44",
  },
  rest_of_europe: {
    label: "Rest of Europe",
    price: 20,
    currency: "EUR",
    currencySymbol: "€",
    gateway: "stripe",
    defaultCountryCode: "+",
  },
  rest_of_world: {
    label: "Rest of the World",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
  },
};

export const REGION_OPTIONS: { value: RegistrationRegion; label: string }[] =
  Object.entries(REGION_CONFIG)
    .map(([value, config]) => ({
      value: value as RegistrationRegion,
      label: config.label,
    }))
    .sort((a, b) => {
      if (a.value === "ghana") return -1;
      if (b.value === "ghana") return 1;
      return a.label.localeCompare(b.label);
    });

export interface AddOnConfig {
  id: string;
  label: string;
  price: number;
  currency: "USD";
  description: string;
}

export type AddOnSelection = {
  id: string;
  quantity: number;
};

export const ADD_ONS: AddOnConfig[] = [
  {
    id: "vip_meals",
    label: "VIP Meals",
    price: 100,
    currency: "USD",
    description: "Premium dining experience with VIP seating.",
  },
  {
    id: "ministers_grill",
    label: "Ministers Grill",
    price: 30,
    currency: "USD",
    description: "Special ministers' grill session.",
  },
];

export {
  DENOMINATIONS_BY_GROUP,
  DENOMINATION_OPTIONS,
  GROUP_OPTIONS,
  UD_FIRST_LOVE_DENOMINATION,
} from "@/lib/groupsDenominations";

export function getGroupPricing(group: string): PricingConfig {
  return GROUP_PRICING[group] ?? GROUP_PRICING.Other;
}

/** Hide church affiliation when registrant belongs to an official group list. */
export function shouldShowChurchAffiliation(
  group: string,
  denomination: string,
) {
  if (!group || group === "Other") return true;
  if (!denomination || denomination === "Other") return true;
  return false;
}

export const HOUSING_TYPES = {
  condo: {
    label: "Condos",
    pricePerStay: 10,
    capacityLimit: 2000,
    notes: "Confirm availability and allocation rules.",
  },
  hostel: {
    label: "Hostels",
    pricePerStay: 25,
    capacityLimit: 600,
    notes: "Confirm room capacity and gender-specific allocation rules.",
  },
  apartment: {
    label: "Apartments",
    pricePerStay: 150,
    capacityLimit: 30,
    notes: "Confirm availability and allocation rules.",
  },
} as const;

export type HousingType = keyof typeof HOUSING_TYPES;

export function formatPrice(amount: number, currency: string, symbol: string) {
  return `${symbol}${amount.toLocaleString()} ${currency}`;
}

export function isPaystackOnlyCurrency(currency: string) {
  return currency === "GHS";
}

export function registrationGatewaysForCurrency(
  currency: string,
): Array<"paystack" | "stripe"> {
  if (isPaystackOnlyCurrency(currency)) return ["paystack"];
  return ["paystack", "stripe"];
}

/** @deprecated Prefer registrationGatewaysForCurrency / getGroupPricing */
export function isPaystackOnlyRegion(region: RegistrationRegion) {
  return REGION_CONFIG[region].currency === "GHS";
}

/** @deprecated Prefer registrationGatewaysForCurrency */
export function registrationGatewaysForRegion(
  region: RegistrationRegion,
): Array<"paystack" | "stripe"> {
  return registrationGatewaysForCurrency(REGION_CONFIG[region].currency);
}

export function normalizeAddOnSelections(
  selections: AddOnSelection[] | Record<string, number>,
): AddOnSelection[] {
  const entries = Array.isArray(selections)
    ? selections
    : Object.entries(selections).map(([id, quantity]) => ({ id, quantity }));

  return entries
    .filter((item) => item.quantity > 0 && ADD_ONS.some((a) => a.id === item.id))
    .map((item) => ({
      id: item.id,
      quantity: Math.floor(item.quantity),
    }));
}

export function calculateRegistrationTotal(
  group: string,
  ticketQuantity: number,
  addOnSelections: AddOnSelection[] | Record<string, number>,
) {
  const pricing = getGroupPricing(group);
  const ticketTotal = pricing.price * ticketQuantity;
  const normalized = normalizeAddOnSelections(addOnSelections);
  const addOnTotal = normalized.reduce((sum, item) => {
    const addOn = ADD_ONS.find((entry) => entry.id === item.id);
    return sum + (addOn?.price ?? 0) * item.quantity;
  }, 0);

  return {
    ticketTotal,
    addOnTotal,
    grandTotal: ticketTotal + addOnTotal,
    currency: pricing.currency,
    currencySymbol: pricing.currencySymbol,
    gateway: pricing.gateway,
    regionKey: pricing.regionKey,
    addOns: normalized,
  };
}
