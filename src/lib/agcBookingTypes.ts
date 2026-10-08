import type { AgcAccommodationType, AgcRegion } from "@/lib/agcPortal";

/** Shapes returned by agcBookings.getAccommodationOverview / listRepBookings. */

export type AvailabilityRow = {
  accommodationType: string;
  scope: string;
  total: number;
  available: number;
  priceGhs: number;
  priceUsd: number;
  bishopPriceGhs: number;
  bishopPriceUsd: number;
};

export type AccommodationTypeInfo = {
  type: string;
  label: string;
  unit: "bed" | "room";
  maxOccupancy: number;
  poolScope: string;
  pricing: { ghs: number; usd: number };
};

export type AccommodationOverview = {
  hubName: string;
  region: AgcRegion;
  currency: "GHS" | "USD";
  isGhsRegion: boolean;
  bishopRate: { ghs: number; usd: number };
  accommodationTypes: AccommodationTypeInfo[];
  availability: AvailabilityRow[];
  holdHours: number;
  deadline: number;
  accommodationBankDetails: string | undefined;
  /** Hub is enrolled in payment-on-arrival (POA) — rep may book without paying. */
  paymentOnArrival: boolean;
};

export type BookingGuest = {
  _id: string;
  firstName: string;
  lastName: string;
  gender: string;
  title: string;
  accommodationType: string;
  isBishopRate: boolean;
  status: string;
};

export type BookingLine = {
  accommodationType: string;
  quantity: number;
  unitPrice: number;
  isBishopRate: boolean;
};

export type RepBooking = {
  _id: string;
  referenceNumber: string;
  currency: string;
  totalAmount: number;
  paymentMode: string;
  paymentStatus: string;
  bookingStatus: string;
  expiresAt: number | null;
  adminMessage: string | null;
  offline: {
    amountPaid?: number;
    referenceNumber?: string;
    paymentDate?: string;
    method?: string;
    receiptFileName?: string;
  } | null;
  /** Payment-on-arrival lifecycle; null for non-POA bookings. */
  poa: {
    status: "pending" | "evidence_submitted" | "confirmed";
    note?: string;
    evidenceFileName?: string;
    submittedAt?: number;
    confirmedAt?: number;
  } | null;
  createdAt: number;
  confirmedAt: number | null;
  guests: BookingGuest[];
  lines: BookingLine[];
};

export type GuestDraftInput = {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title: string;
  accommodationType: AgcAccommodationType;
  isBishopRate: boolean;
};
