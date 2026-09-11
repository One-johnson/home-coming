export type CheckoutRecordType = "registration" | "booking" | "tour";

export function buildCheckoutUrls(basePath: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return {
    successUrl: `${origin}${basePath}/success?session_id={CHECKOUT_SESSION_ID}`,
    /** Paystack appends `?reference=` / `?trxref=` to this callback URL. */
    paystackCallbackUrl: `${origin}${basePath}/success`,
    cancelUrl: `${origin}${basePath}?canceled=1`,
  };
}
