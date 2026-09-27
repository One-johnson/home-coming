export type CheckoutRecordType = "registration" | "booking" | "tour";

export function buildCheckoutUrls(basePath: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return {
    successUrl: `${origin}${basePath}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}${basePath}?canceled=1`,
  };
}
