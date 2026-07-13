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
}

export const REGION_CONFIG: Record<RegistrationRegion, RegionConfig> = {
  ghana: {
    label: "Ghana",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
  },
  west_africa: {
    label: "West Africa",
    price: 20,
    currency: "GHS",
    currencySymbol: "₵",
    gateway: "paystack",
  },
  rest_of_africa: {
    label: "Rest of Africa",
    price: 10,
    currency: "USD",
    currencySymbol: "$",
    gateway: "paystack",
  },
  usa: {
    label: "USA",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "paypal",
  },
  canada: {
    label: "Canada",
    price: 20,
    currency: "CAD",
    currencySymbol: "CA$",
    gateway: "paypal",
  },
  switzerland: {
    label: "Switzerland",
    price: 20,
    currency: "CHF",
    currencySymbol: "CHF",
    gateway: "paypal",
  },
  uk: {
    label: "United Kingdom",
    price: 20,
    currency: "GBP",
    currencySymbol: "£",
    gateway: "paypal",
  },
  rest_of_europe: {
    label: "Rest of Europe",
    price: 20,
    currency: "EUR",
    currencySymbol: "€",
    gateway: "paypal",
  },
  rest_of_world: {
    label: "Rest of the World",
    price: 20,
    currency: "USD",
    currencySymbol: "$",
    gateway: "paypal",
  },
};

export const REGION_OPTIONS: { value: RegistrationRegion; label: string }[] =
  Object.entries(REGION_CONFIG).map(([value, config]) => ({
    value: value as RegistrationRegion,
    label: config.label,
  }));

export interface AddOnConfig {
  id: string;
  label: string;
  price: number;
  currency: "USD";
  description: string;
}

export const ADD_ONS: AddOnConfig[] = [
  {
    id: "tours",
    label: "Tours",
    price: 40,
    currency: "USD",
    description: "Guided tours during the convention.",
  },
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

export function calculateRegistrationTotal(
  region: RegistrationRegion,
  ticketQuantity: number,
  addOnIds: string[],
) {
  const regionConfig = REGION_CONFIG[region];
  const ticketTotal = regionConfig.price * ticketQuantity;
  const addOnTotal = addOnIds.reduce((sum, id) => {
    const addOn = ADD_ONS.find((item) => item.id === id);
    return sum + (addOn?.price ?? 0) * ticketQuantity;
  }, 0);

  return {
    ticketTotal,
    addOnTotal,
    grandTotal: ticketTotal + addOnTotal,
    currency: regionConfig.currency,
    currencySymbol: regionConfig.currencySymbol,
    gateway: regionConfig.gateway,
  };
}
