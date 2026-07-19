import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { ConfirmationEmailType } from "./paymentEmail";

const ADD_ON_LABELS: Record<string, string> = {
  vip_meals: "VIP Meals",
  ministers_grill: "Ministers Grill",
};

const HOUSING_TYPE_LABELS: Record<string, string> = {
  condo: "Condo",
  hostel: "Hostel",
  apartment: "Apartment",
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

export type AccommodationPayload = {
  kind: "accommodation_confirmation";
  to: string;
  subject: string;
  bannerUrl: string;
  guestName: string;
  housingLabel: string;
  referenceNumber: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalAmount: string;
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
  | AccommodationPayload
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
    case "accommodation_confirmation":
      return [
        `Dear ${payload.guestName},`,
        "",
        "Thank you for booking campus accommodation. Payment confirmed.",
        `Reference: ${payload.referenceNumber}`,
        `Housing: ${payload.housingLabel}`,
        `Check-in: ${payload.checkIn}`,
        `Check-out: ${payload.checkOut}`,
        `Guests: ${payload.guests}`,
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

    case "accommodation_confirmation": {
      const record = await ctx.db.get(recordId as Id<"housingBookings">);
      if (!record) return null;

      return {
        kind: "accommodation_confirmation",
        to: record.guestEmail,
        subject: "Homecoming Accommodation Confirmation",
        bannerUrl,
        guestName: record.guestName,
        housingLabel:
          HOUSING_TYPE_LABELS[record.housingType] ?? record.housingType,
        referenceNumber: record.referenceNumber ?? recordId,
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        guests: record.guests,
        totalAmount: formatMoney(record.totalAmount, record.currency),
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
