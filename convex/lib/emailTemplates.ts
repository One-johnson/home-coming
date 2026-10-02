import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ConfirmationEmailType } from "./paymentEmail";

const ADD_ON_LABELS: Record<string, string> = {
  vip_meals: "VIP Meals",
  ministers_grill: "Ministers Grill",
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`;
}

function getBannerUrl() {
  const siteUrl =
    process.env.EMAIL_BANNER_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";
  return `${siteUrl.replace(/\/$/, "")}/hero/banner.jpeg`;
}

export type RegistrationPayload = {
  kind: "registration_confirmation";
  to: string;
  subject: string;
  bannerUrl: string;
  recipientName: string;
  referenceNumber: string;
  ticketQuantity: number;
  addOnLines: string[];
  totalAmount: string;
  accommodationInterest: boolean;
};

export type TourPayload = {
  kind: "tour_confirmation";
  to: string;
  subject: string;
  bannerUrl: string;
  fullName: string;
  referenceNumber: string;
  itemLines: string[];
  totalAmount: string;
};

export type ConfirmationEmailPayload =
  | RegistrationPayload
  | TourPayload;

/** Build plain-text fallback used when storing the log before Node rendering. */
export function plainTextFromPayload(payload: ConfirmationEmailPayload): string {
  switch (payload.kind) {
    case "registration_confirmation":
      return [
        `Dear ${payload.recipientName},`,
        "",
        "Thank you for registering for The Homecoming. Payment confirmed.",
        `Reference: ${payload.referenceNumber}`,
        `Tickets: ${payload.ticketQuantity}`,
        ...(payload.addOnLines.length
          ? ["Add-ons:", ...payload.addOnLines.map((l) => `- ${l}`)]
          : []),
        `Total: ${payload.totalAmount}`,
      ].join("\n");
    case "tour_confirmation":
      return [
        `Dear ${payload.fullName},`,
        "",
        "Thank you for booking Homecoming tours. Payment confirmed.",
        `Reference: ${payload.referenceNumber}`,
        "Tours:",
        ...payload.itemLines.map((l) => `- ${l}`),
        `Total: ${payload.totalAmount}`,
      ].join("\n");
  }
}

export async function buildConfirmationEmailPayload(
  ctx: QueryCtx,
  type: ConfirmationEmailType,
  recordId: string,
): Promise<ConfirmationEmailPayload | null> {
  const bannerUrl = getBannerUrl();

  switch (type) {
    case "registration_confirmation": {
      const record = await ctx.db.get(recordId as Id<"registrations">);
      if (!record) return null;

      const recipientName =
        record.type === "individual"
          ? record.fullName ?? "Participant"
          : record.group ?? "Group registration";

      const addOnLines = record.addOns
        .map((addOn) => {
          if (typeof addOn === "string") {
            return ADD_ON_LABELS[addOn] ?? addOn;
          }
          const label = ADD_ON_LABELS[addOn.id] ?? addOn.id;
          return `${label} × ${addOn.quantity}`;
        })
        .filter(Boolean);

      return {
        kind: "registration_confirmation",
        to: record.email,
        subject: "Homecoming Registration Confirmation",
        bannerUrl,
        recipientName,
        referenceNumber: record.referenceNumber ?? recordId,
        ticketQuantity: record.ticketQuantity,
        addOnLines,
        totalAmount: formatMoney(record.totalAmount, record.currency),
        accommodationInterest: record.accommodationInterest,
      };
    }

    case "tour_confirmation": {
      const record = await ctx.db.get(recordId as Id<"tourOrders">);
      if (!record) return null;

      return {
        kind: "tour_confirmation",
        to: record.email,
        subject: "Homecoming Tour Order Confirmation",
        bannerUrl,
        fullName: record.fullName,
        referenceNumber: record.referenceNumber ?? recordId,
        itemLines: record.items.map(
          (item) =>
            `${item.label} × ${item.quantity} (${formatMoney(item.unitPrice * item.quantity, record.currency)})`,
        ),
        totalAmount: formatMoney(record.totalAmount, record.currency),
      };
    }
  }
}
