import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/webhooks/paystack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const reference = body?.data?.reference ?? body?.reference;
    const status = body?.data?.status === "success" ? "paid" : "failed";
    const metadata = body?.data?.metadata ?? {};

    if (reference && metadata.recordId && metadata.type) {
      await ctx.runMutation(internal.payments.confirmPayment, {
        reference,
        status,
        type: metadata.type,
        recordId: metadata.recordId,
      });
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }),
});

http.route({
  path: "/webhooks/paypal",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const reference = body?.resource?.id ?? body?.id;
    const status =
      body?.event_type === "PAYMENT.CAPTURE.COMPLETED" ? "paid" : "failed";
    const metadata = body?.resource?.custom_id
      ? JSON.parse(body.resource.custom_id)
      : {};

    if (reference && metadata.recordId && metadata.type) {
      await ctx.runMutation(internal.payments.confirmPayment, {
        reference,
        status,
        type: metadata.type,
        recordId: metadata.recordId,
      });
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }),
});

export default http;
