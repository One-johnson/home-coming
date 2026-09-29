import type { BookingGuest, RepBooking } from "@/lib/agcBookingTypes";
import { paymentStatusMeta } from "@/lib/agcPortal";

/**
 * Display helpers for rep accommodation bookings. Kept pure so the badge and
 * roster rules can be unit-tested independently of the React tree.
 */

/** Cancelled and expired holds are closed — they no longer owe payment. */
export function isClosedBooking(
  booking: Pick<RepBooking, "bookingStatus">,
): boolean {
  return (
    booking.bookingStatus === "cancelled" || booking.bookingStatus === "expired"
  );
}

/**
 * Payment badge for display. A cancelled/expired booking must never show
 * "Awaiting payment" (it would inflate payment-chasing totals), so closed
 * bookings get a neutral "Not paid" badge instead.
 */
export function displayPaymentStatus(
  booking: Pick<RepBooking, "bookingStatus" | "paymentStatus">,
): { label: string; className: string } {
  if (isClosedBooking(booking)) {
    return {
      label: "Not paid",
      className: "border-border bg-muted text-muted-foreground",
    };
  }
  return paymentStatusMeta(booking.paymentStatus);
}

export type GuestRosterRow = {
  /** Stable React key: `${bookingId}:${guestId}`. */
  key: string;
  guest: BookingGuest;
  booking: RepBooking;
};

/**
 * Flat guest roster for the quick-scan table: every active guest across all
 * bookings, in booking order (newest first, as listRepBookings returns).
 */
export function guestRosterRows(bookings: RepBooking[]): GuestRosterRow[] {
  const rows: GuestRosterRow[] = [];
  for (const booking of bookings) {
    for (const guest of booking.guests) {
      if (guest.status !== "active") continue;
      rows.push({ key: `${booking._id}:${guest._id}`, guest, booking });
    }
  }
  return rows;
}
