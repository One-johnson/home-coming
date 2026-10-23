import type { RepBooking } from "@/lib/agcBookingTypes";
import { AGC_ACCOMMODATION_TYPES } from "@/lib/bookingMath";

/**
 * Small pure helpers behind the rep portal's desktop/mobile affordances:
 * saved guest drafts, the "needs attention" urgency line and table sorting.
 * Kept out of the component so the rules can be tested without the React tree.
 */

/** One guest row in the new-reservation builder. */
export type BookingDraft = {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title: string;
  accommodationType: keyof typeof AGC_ACCOMMODATION_TYPES;
  isBishopRate: boolean;
};

const DRAFT_STORAGE_PREFIX = "agc.portal.drafts.";
const MAX_RESTORED_DRAFTS = 200;

/**
 * Session-independent, but hub-scoped: a shared desk phone can switch reps and
 * must never restore another hub's roster.
 */
export function draftStorageKey(hubUsername: string): string {
  return `${DRAFT_STORAGE_PREFIX}${hubUsername}`;
}

export function serializeDrafts(drafts: BookingDraft[]): string {
  return JSON.stringify(drafts.slice(0, MAX_RESTORED_DRAFTS));
}

/**
 * Parse what `serializeDrafts` wrote. Anything malformed is dropped rather
 * than thrown — a stale or hand-edited value must not break the portal.
 */
export function parseStoredDrafts(raw: string | null): BookingDraft[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];

  const drafts: BookingDraft[] = [];
  for (const entry of value.slice(0, MAX_RESTORED_DRAFTS)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.firstName !== "string" || typeof row.lastName !== "string") {
      continue;
    }
    const accommodationType =
      typeof row.accommodationType === "string" &&
      row.accommodationType in AGC_ACCOMMODATION_TYPES
        ? (row.accommodationType as BookingDraft["accommodationType"])
        : "dormitory";
    drafts.push({
      firstName: row.firstName,
      lastName: row.lastName,
      gender: row.gender === "female" ? "female" : "male",
      title: typeof row.title === "string" && row.title ? row.title : "Member",
      accommodationType,
      isBishopRate: row.isBishopRate === true,
    });
  }
  return drafts;
}

export type HoldWatch = {
  booking: RepBooking;
  msLeft: number;
};

const DAY_MS = 86_400_000;

/**
 * Reserved holds that expire inside the window, soonest first. These are the
 * only bookings that silently lose their beds, so they drive the urgency line.
 */
export function expiringHolds(
  bookings: RepBooking[],
  now: number,
  windowMs = DAY_MS,
): HoldWatch[] {
  const holding: HoldWatch[] = [];
  for (const booking of bookings) {
    const expiresAt = booking.expiresAt;
    if (booking.bookingStatus !== "reserved") continue;
    if (typeof expiresAt !== "number") continue;
    const msLeft = expiresAt - now;
    if (msLeft <= 0 || msLeft > windowMs) continue;
    holding.push({ booking, msLeft });
  }
  return holding.sort((a, b) => a.msLeft - b.msLeft);
}

/** Compact countdown ("5h 12m", "3d 4h") shared by the urgency line. */
export function formatHoldLeft(msLeft: number): string {
  if (msLeft <= 0) return "expired";
  const totalMinutes = Math.floor(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${totalMinutes % 60}m`;
  return `${Math.max(1, totalMinutes)}m`;
}

export type AttentionSummary = {
  expiring: number;
  /** Holds expiring within the *soon* window (6h) — worth naming directly. */
  urgent: number;
  soonest: HoldWatch | null;
  /** Receipts the rep has to redo after finance asked for a correction. */
  corrections: number;
};

export function attentionSummary(
  bookings: RepBooking[],
  now: number,
): AttentionSummary {
  const withinDay = expiringHolds(bookings, now);
  const urgent = withinDay.filter((hold) => hold.msLeft <= 6 * 3_600_000);
  const corrections = bookings.filter(
    (booking) =>
      !(
        booking.bookingStatus === "cancelled" ||
        booking.bookingStatus === "expired"
      ) && booking.paymentStatus === "correction_requested",
  ).length;

  return {
    expiring: withinDay.length,
    urgent: urgent.length,
    soonest: withinDay[0] ?? null,
    corrections,
  };
}

export type BookingSortKey = "reference" | "guests" | "total" | "expiry";
export type SortDirection = "asc" | "desc";

export type BookingSort = { key: BookingSortKey; direction: SortDirection };

const activeGuestCount = (booking: RepBooking) =>
  booking.guests.filter((guest) => guest.status === "active").length;

/**
 * Sort for the desktop table. Bookings without an expiry always sink to the
 * bottom of an expiry sort — "no hold window" is not "expiring first".
 */
export function sortBookings(
  bookings: RepBooking[],
  sort: BookingSort,
): RepBooking[] {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...bookings].sort((a, b) => {
    if (sort.key === "expiry") {
      // A booking with no hold window is not "expiring first" in either
      // direction — it always sorts last.
      const left = a.expiresAt;
      const right = b.expiresAt;
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return (left - right) * factor;
    }

    if (sort.key === "reference") {
      return (
        a.referenceNumber.localeCompare(b.referenceNumber, undefined, {
          numeric: true,
        }) * factor
      );
    }

    const left =
      sort.key === "guests" ? activeGuestCount(a) : a.totalAmount;
    const right =
      sort.key === "guests" ? activeGuestCount(b) : b.totalAmount;
    return (left - right) * factor;
  });
}

/** Toggle behaviour for a clickable column header. */
export function nextSort(
  current: BookingSort,
  key: BookingSortKey,
  defaultDirection: SortDirection = "asc",
): BookingSort {
  if (current.key !== key) return { key, direction: defaultDirection };
  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}
