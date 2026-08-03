"use node";

import Stripe from "stripe";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const checkoutTypeValidator = v.union(
  v.literal("registration"),
  v.literal("booking"),
  v.literal("tour"),
);

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

function toStripeUnitAmount(amount: number) {
  return Math.round(amount * 100);
}

type CheckoutRecord = {
  type: "registration" | "booking" | "tour";
  recordId: string;
  email: string;
  totalAmount: number;
  currency: string;
  gateway?: string;
  paymentStatus: string;
  paymentReference?: string;
  referenceNumber?: string;
  description: string;
};

type CreateCheckoutResult =
  | {
      mode: "already_paid";
      reference: string | undefined;
      message: string;
    }
  | {
      mode: "mock";
      reference: string;
      message: string;
    }
  | {
      mode: "checkout";
      sessionId: string;
      url: string;
    };

type FinalizeCheckoutResult = {
  type: "registration" | "booking" | "tour";
  recordId: string;
  paymentStatus: string;
  referenceNumber: string | undefined;
  email: string | undefined;
  amountTotal: number | null;
  currency: string | null;
};

export const createCheckoutSession = action({
  args: {
    type: checkoutTypeValidator,
    recordId: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<CreateCheckoutResult> => {
    const record = (await ctx.runQuery(internal.payments.getCheckoutRecord, {
      type: args.type,
      recordId: args.recordId,
    })) as CheckoutRecord | null;

    if (!record) {
      throw new Error("Payment record not found");
    }

    if (
      record.paymentStatus === "paid" ||
      record.paymentStatus === "mock_paid"
    ) {
      return {
        mode: "already_paid" as const,
        reference: record.paymentReference ?? record.referenceNumber,
        message: "Payment already completed.",
      };
    }

    if (record.totalAmount <= 0) {
      const reference = `FREE-${Date.now()}`;
      await ctx.runMutation(internal.payments.applyMockPayment, {
        type: args.type,
        recordId: args.recordId,
        reference,
      });
      return {
        mode: "mock" as const,
        reference,
        message: "No payment required.",
      };
    }

    if (record.gateway === "paystack") {
      throw new Error(
        "This order is set up for Paystack, not Stripe. Complete payment with Paystack.",
      );
    }

    if (record.currency.toLowerCase() === "ghs") {
      throw new Error(
        "Stripe cannot charge GHS. Ghana and West Africa registrations must use Paystack.",
      );
    }

    const currency = record.currency.toLowerCase();

    const stripe = getStripe();
    if (!stripe) {
      const reference = `MOCK-STRIPE-${Date.now()}`;
      await ctx.runMutation(internal.payments.applyMockPayment, {
        type: args.type,
        recordId: args.recordId,
        reference,
      });
      return {
        mode: "mock" as const,
        reference,
        message: "Stripe is not configured. Payment simulated.",
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: record.email,
      client_reference_id: record.referenceNumber ?? args.recordId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeUnitAmount(record.totalAmount),
            product_data: {
              name: record.description,
              description: record.referenceNumber
                ? `Reference ${record.referenceNumber}`
                : undefined,
            },
          },
        },
      ],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata: {
        type: args.type,
        recordId: args.recordId,
        referenceNumber: record.referenceNumber ?? "",
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    await ctx.runMutation(internal.payments.setPaymentReference, {
      type: args.type,
      recordId: args.recordId,
      paymentReference: session.id,
    });

    return {
      mode: "checkout" as const,
      sessionId: session.id,
      url: session.url,
    };
  },
});

export const finalizeCheckoutSession = action({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args): Promise<FinalizeCheckoutResult> => {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    const session = await stripe.checkout.sessions.retrieve(args.sessionId);
    const type = session.metadata?.type as
      | "registration"
      | "booking"
      | "tour"
      | undefined;
    const recordId = session.metadata?.recordId;

    if (!type || !recordId) {
      throw new Error("Checkout session is missing payment metadata");
    }

    if (session.payment_status === "paid") {
      await ctx.runMutation(internal.payments.confirmPayment, {
        reference: session.id,
        status: "paid",
        type,
        recordId,
      });
    }

    const record = (await ctx.runQuery(internal.payments.getCheckoutRecord, {
      type,
      recordId,
    })) as CheckoutRecord | null;

    return {
      type,
      recordId,
      paymentStatus: record?.paymentStatus ?? "pending_payment",
      referenceNumber: record?.referenceNumber ?? session.metadata?.referenceNumber,
      email: record?.email,
      amountTotal: session.amount_total,
      currency: session.currency,
    };
  },
});

export const handleWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const stripe = getStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
      throw new Error("Stripe webhook is not configured");
    }

    const event = stripe.webhooks.constructEvent(
      args.body,
      args.signature,
      webhookSecret,
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const type = session.metadata?.type as
        | "registration"
        | "booking"
        | "tour"
        | undefined;
      const recordId = session.metadata?.recordId;

      if (type && recordId && session.payment_status === "paid") {
        await ctx.runMutation(internal.payments.confirmPayment, {
          reference: session.id,
          status: "paid",
          type,
          recordId,
        });
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const type = session.metadata?.type as
        | "registration"
        | "booking"
        | "tour"
        | undefined;
      const recordId = session.metadata?.recordId;

      if (type && recordId) {
        await ctx.runMutation(internal.payments.confirmPayment, {
          reference: session.id,
          status: "failed",
          type,
          recordId,
        });
      }
    }

    return { received: true };
  },
});
