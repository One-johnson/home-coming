import { httpRouter } from "convex/server";

// No public HTTP routes remain: the Stripe and PayPal webhook routes were
// removed together with online payments. All payment is offline (receipt
// verification in the admin console).
const http = httpRouter();

export default http;
