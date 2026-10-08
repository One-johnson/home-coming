import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";

/**
 * CSV row builder for the admin accommodation table. The table's own columns
 * only carry a guest *count* — names, gender and accommodation type live in
 * the expanded row — so the export fans each booking out into one row per
 * guest and repeats the booking context on every row.
 *
 * Kept pure so the fan-out rules can be unit-tested without the React tree.
 */

export type BookingExportGuest = {
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  phone?: string | null;
  email?: string | null;
  accommodationType: string;
  isBishopRate: boolean;
  status: string;
};

export type BookingExportSource = {
  referenceNumber: string;
  hubName: string;
  region: string;
  bookingStatus: string;
  paymentStatus: string;
  paymentMode: string;
  totalAmount: number;
  currency: string;
  createdAt: number;
  guests: BookingExportGuest[];
};

/** Accommodation type label for exports — falls back to the stored key. */
export function accommodationTypeLabel(type: string): string {
  return (
    AGC_ACCOMMODATION_LABELS[
      type as keyof typeof AGC_ACCOMMODATION_LABELS
    ] ?? type
  );
}

/**
 * One CSV row per guest, or one row with blank guest columns when a booking
 * has no guests recorded — fanned-out exports must never silently drop a
 * booking from the file.
 */
export function accommodationExportRows(
  booking: BookingExportSource,
): Array<Record<string, unknown>> {
  const who = {
    reference: booking.referenceNumber,
    hub: booking.hubName,
    region: booking.region,
  };
  const bookingContext = {
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    paymentMode: booking.paymentMode,
    total: booking.totalAmount,
    currency: booking.currency,
    createdAt: new Date(booking.createdAt).toISOString(),
  };

  if (booking.guests.length === 0) {
    return [
      {
        ...who,
        title: "",
        firstName: "",
        lastName: "",
        gender: "",
        phone: "",
        email: "",
        accommodationType: "",
        bishopRate: "",
        guestStatus: "",
        ...bookingContext,
      },
    ];
  }

  return booking.guests.map((guest) => ({
    ...who,
    title: guest.title,
    firstName: guest.firstName,
    lastName: guest.lastName,
    gender: guest.gender,
    phone: guest.phone ?? "",
    email: guest.email ?? "",
    accommodationType: accommodationTypeLabel(guest.accommodationType),
    bishopRate: guest.isBishopRate ? "yes" : "no",
    guestStatus: guest.status,
    ...bookingContext,
  }));
}
