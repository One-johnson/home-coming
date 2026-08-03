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
    price: 10,
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

export function calculateRegistrationAmounts(
  region: RegistrationRegion,
  ticketQuantity: number,
  addOns: { id: string; quantity: number }[],
) {
  const regionConfig = REGION_CONFIG[region];
  const priceAmount = regionConfig.price * ticketQuantity;
  const addOnAmount = addOns.reduce((sum, item) => {
    const addOn = ADD_ONS.find((entry) => entry.id === item.id);
    return sum + (addOn?.price ?? 0) * item.quantity;
  }, 0);

  return {
    priceAmount,
    addOnAmount,
    totalAmount: priceAmount + addOnAmount,
    currency: regionConfig.currency,
    gateway: regionConfig.gateway,
  };
}
