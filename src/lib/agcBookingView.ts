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

/** One or two initials for an avatar chip ("Kwame Mensah" -> "KM"). */
export function guestInitials(
  guest: Pick<BookingGuest, "firstName" | "lastName">,
): string {
  const first = guest.firstName?.trim()?.[0] ?? "";
  const last = guest.lastName?.trim()?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Stable avatar chip color per guest (deterministic across renders).
 * Gender-tinted pairs: cool for male, warm for female — subtle but scannable.
 */
export function guestAvatarClass(
  guest: Pick<BookingGuest, "firstName" | "lastName" | "gender">,
): string {
  const seed = `${guest.firstName} ${guest.lastName}`
    .toLowerCase()
    .split("")
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 997, 7);
  const male = [
    "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
    "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  ];
  const female = [
    "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ];
  const palette = guest.gender === "female" ? female : male;
  return palette[seed % palette.length];
}
