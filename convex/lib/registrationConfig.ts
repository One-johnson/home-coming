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

export const REGION_CONFIG: Record<
  RegistrationRegion,
  { label: string; price: number; currency: string; gateway: "paystack" | "paypal" }
> = {
  ghana: { label: "Ghana", price: 20, currency: "GHS", gateway: "paystack" },
  west_africa: { label: "West Africa", price: 20, currency: "GHS", gateway: "paystack" },
  rest_of_africa: { label: "Rest of Africa", price: 10, currency: "USD", gateway: "paystack" },
  usa: { label: "USA", price: 20, currency: "USD", gateway: "paypal" },
  canada: { label: "Canada", price: 20, currency: "CAD", gateway: "paypal" },
  switzerland: { label: "Switzerland", price: 20, currency: "CHF", gateway: "paypal" },
  uk: { label: "United Kingdom", price: 20, currency: "GBP", gateway: "paypal" },
  rest_of_europe: { label: "Rest of Europe", price: 20, currency: "EUR", gateway: "paypal" },
  rest_of_world: { label: "Rest of the World", price: 20, currency: "USD", gateway: "paypal" },
};
