"use node";

import { createHmac, timingSafeEqual } from "crypto";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const checkoutTypeValidator = v.union(
  v.literal("registration"),
  v.literal("booking"),
  v.literal("tour"),
);

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
      reference: string;
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

function getPaystackSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key || key === "sk_test_placeholder") return null;
  return key;
}

function toPaystackAmount(amount: number) {
  return Math.round(amount * 100);
}

function buildReference(
  type: string,
  recordId: string,
  referenceNumber?: string,
) {
  const base = referenceNumber?.trim() || `${type}_${recordId}`;
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return `${safe}_${Date.now()}`;
}

async function paystackRequest(
  path: string,
  init?: RequestInit & { secretKey: string },
) {
  const { secretKey, ...requestInit } = init ?? { secretKey: "" };
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...requestInit,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(requestInit.headers ?? {}),
    },
  });
  const payload = (await response.json()) as {
    status: boolean;
    message?: string;
    data?: Record<string, unknown>;
  };
  if (!response.ok || !payload.status) {
    throw new Error(payload.message || "Paystack request failed");
  }
  return payload.data ?? {};
}

export const createCheckoutSession = action({
  args: {
    type: checkoutTypeValidator,
    recordId: v.string(),
    callbackUrl: v.string(),
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

    if (record.gateway === "stripe") {
      throw new Error(
        "This order is set up for Stripe, not Paystack. Complete payment with Stripe.",
      );
    }

    const secretKey = getPaystackSecretKey();
    if (!secretKey) {
      const reference = `MOCK-PAYSTACK-${Date.now()}`;
      await ctx.runMutation(internal.payments.applyMockPayment, {
        type: args.type,
        recordId: args.recordId,
        reference,
      });
      return {
        mode: "mock" as const,
        reference,
        message: "Paystack is not configured. Payment simulated.",
      };
    }

    const reference = buildReference(
      args.type,
      args.recordId,
      record.referenceNumber,
    );

    const data = await paystackRequest("/transaction/initialize", {
      method: "POST",
      secretKey,
      body: JSON.stringify({
        email: record.email,
        amount: toPaystackAmount(record.totalAmount),
        currency: record.currency.toUpperCase(),
        reference,
        callback_url: args.callbackUrl,
        metadata: {
          type: args.type,
          recordId: args.recordId,
          referenceNumber: record.referenceNumber ?? "",
          description: record.description,
        },
      }),
    });

    const url = data.authorization_url;
    if (typeof url !== "string" || !url) {
      throw new Error("Paystack did not return a checkout URL");
    }

    await ctx.runMutation(internal.payments.setPaymentReference, {
      type: args.type,
      recordId: args.recordId,
      paymentReference: reference,
    });

    return {
      mode: "checkout" as const,
      reference,
      url,
    };
  },
});

export const finalizeCheckoutSession = action({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, args): Promise<FinalizeCheckoutResult> => {
    const secretKey = getPaystackSecretKey();
    if (!secretKey) {
      throw new Error("Paystack is not configured");
    }

    const data = await paystackRequest(
      `/transaction/verify/${encodeURIComponent(args.reference)}`,
      { method: "GET", secretKey },
    );

    const metadata = (data.metadata ?? {}) as {
      type?: string;
      recordId?: string;
      referenceNumber?: string;
    };
    const type = metadata.type as
      | "registration"
      | "booking"
      | "tour"
      | undefined;
    const recordId = metadata.recordId;

    if (!type || !recordId) {
      throw new Error("Paystack transaction is missing payment metadata");
    }

    const status = data.status === "success" ? "paid" : "failed";
    await ctx.runMutation(internal.payments.confirmPayment, {
      reference: args.reference,
      status,
      type,
      recordId,
    });

    const record = (await ctx.runQuery(internal.payments.getCheckoutRecord, {
      type,
      recordId,
    })) as CheckoutRecord | null;

    const amount =
      typeof data.amount === "number" ? data.amount : null;
    const currency =
      typeof data.currency === "string" ? data.currency.toLowerCase() : null;

    return {
      type,
      recordId,
      paymentStatus: record?.paymentStatus ?? "pending_payment",
      referenceNumber:
        record?.referenceNumber ?? metadata.referenceNumber ?? undefined,
      email: record?.email,
      amountTotal: amount,
      currency,
    };
  },
});

export const handleWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const secretKey = getPaystackSecretKey();
    if (!secretKey) {
      throw new Error("Paystack webhook is not configured");
    }

    const hash = createHmac("sha512", secretKey)
      .update(args.body)
      .digest("hex");
    const expected = Buffer.from(hash);
    const provided = Buffer.from(args.signature);
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      throw new Error("Invalid Paystack signature");
    }

    const event = JSON.parse(args.body) as {
      event?: string;
      data?: {
        reference?: string;
        status?: string;
        metadata?: {
          type?: string;
          recordId?: string;
        };
      };
    };

    if (event.event !== "charge.success" && event.event !== "charge.failed") {
      return { received: true };
    }

    const reference = event.data?.reference;
    const type = event.data?.metadata?.type as
      | "registration"
      | "booking"
      | "tour"
      | undefined;
    const recordId = event.data?.metadata?.recordId;
    const status =
      event.event === "charge.success" || event.data?.status === "success"
        ? "paid"
        : "failed";

    if (reference && type && recordId) {
      await ctx.runMutation(internal.payments.confirmPayment, {
        reference,
        status,
        type,
        recordId,
      });
    }

    return { received: true };
  },
});
