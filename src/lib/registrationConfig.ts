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

export type PaymentGateway = "paystack" | "paypal";

export type RegistrationType = "individual" | "group";

export interface RegionConfig {
  label: string;
  price: number;
  currency: string;
  currencySymbol: string;
  gateway: PaymentGateway;
  defaultCountryCode: string;
}

export const REGION_CONFIG: Record<RegistrationRegion, RegionConfig> = {
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
    price: 10,
    currency: "USD",
    currencySymbol: "$",
    gateway: "paystack",
    defaultCountryCode: "+",
  },
  usa: {
    label: "USA",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "paypal",
    defaultCountryCode: "+1",
  },
  canada: {
    label: "Canada",
    price: 20,
    currency: "CAD",
    currencySymbol: "CA$",
    gateway: "paypal",
    defaultCountryCode: "+1",
  },
  switzerland: {
    label: "Switzerland",
    price: 20,
    currency: "CHF",
    currencySymbol: "CHF",
    gateway: "paypal",
    defaultCountryCode: "+41",
  },
  uk: {
    label: "United Kingdom",
    price: 20,
    currency: "GBP",
    currencySymbol: "£",
    gateway: "paypal",
    defaultCountryCode: "+44",
  },
  rest_of_europe: {
    label: "Rest of Europe",
    price: 20,
    currency: "EUR",
    currencySymbol: "€",
    gateway: "paypal",
    defaultCountryCode: "+",
  },
  rest_of_world: {
    label: "Rest of the World",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "paypal",
    defaultCountryCode: "+",
  },
};

/** Alphabetically sorted, with Ghana pinned first as the default region. */
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
  region: RegistrationRegion,
  ticketQuantity: number,
  addOnSelections: AddOnSelection[] | Record<string, number>,
) {
  const regionConfig = REGION_CONFIG[region];
  const ticketTotal = regionConfig.price * ticketQuantity;
  const normalized = normalizeAddOnSelections(addOnSelections);
  const addOnTotal = normalized.reduce((sum, item) => {
    const addOn = ADD_ONS.find((entry) => entry.id === item.id);
    return sum + (addOn?.price ?? 0) * item.quantity;
  }, 0);

  return {
    ticketTotal,
    addOnTotal,
    grandTotal: ticketTotal + addOnTotal,
    currency: regionConfig.currency,
    currencySymbol: regionConfig.currencySymbol,
    gateway: regionConfig.gateway,
    addOns: normalized,
  };
}
