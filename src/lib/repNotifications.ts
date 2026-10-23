import type { RepBooking } from "@/lib/agcBookingTypes";
import { expiringHolds, formatHoldLeft } from "@/lib/portalBookingsUx";

/**
 * Notification feed for the rep portal.
 *
 * There is no notifications table to read: everything a rep needs to act on
 * already exists in the data they are allowed to see — holds about to lapse,
 * a receipt finance bounced back, receipts under review, a published rooming
 * list, a closing deadline. Deriving the feed keeps it truthful (nothing goes
 * stale) and needs no new writes. Kept pure so the rules can be tested.
 */

export type RepNotificationTone = "danger" | "warning" | "info" | "success";

export type RepNotificationTab = "overview" | "accommodation" | "registration";

export type RepNotification = {
  id: string;
  title: string;
  body: string;
  tone: RepNotificationTone;
  tab: RepNotificationTab;
  /** Filter the destination tab should open with. */
  filter?: string;
  /** Higher shows first. */
  priority: number;
};

export type NotificationSource = {
  bookings: RepBooking[];
  /** From agcPortal.getRepOverview. */
  receiptsPending: number;
  awaitingPayment: number;
  /** Epoch ms the booking window closes, if known. */
  deadline: number | null;
  /** Rooms an Accommodation Admin has published for this hub. */
  publishedRooms: { roomId: string; name: string }[];
  now: number;
};

const HOUR = 3_600_000;
const DAY = 86_400_000;
const SEEN_PREFIX = "agc.portal.notifications.seen.";
const MAX_SEEN = 200;

export function notificationSeenKey(hubUsername: string): string {
  return `${SEEN_PREFIX}${hubUsername}`;
}

const isClosed = (booking: RepBooking) =>
  booking.bookingStatus === "cancelled" || booking.bookingStatus === "expired";

export function buildRepNotifications(
  source: NotificationSource,
): RepNotification[] {
  const { bookings, now } = source;
  const items: RepNotification[] = [];

  // Holds are the only thing that silently lapses, so they outrank the rest.
  for (const { booking, msLeft } of expiringHolds(bookings, now)) {
    const guestCount = booking.guests.filter(
      (guest) => guest.status === "active",
    ).length;
    items.push({
      id: `hold:${booking._id}`,
      title: `Hold expires in ${formatHoldLeft(msLeft)}`,
      body: `${booking.referenceNumber || "Reservation"} · ${guestCount} guest${guestCount === 1 ? "" : "s"} — pay and upload the receipt to keep the beds.`,
      tone: msLeft <= 6 * HOUR ? "danger" : "warning",
      tab: "accommodation",
      filter: "awaiting",
      priority: 100 - Math.floor(msLeft / HOUR),
    });
  }

  for (const booking of bookings) {
    if (isClosed(booking)) continue;
    if (booking.paymentStatus !== "correction_requested") continue;
    items.push({
      id: `correction:${booking._id}`,
      title: "Finance needs a new receipt",
      body: `${booking.referenceNumber || "Reservation"} — submit a corrected receipt so the beds stay yours.`,
      tone: "warning",
      tab: "accommodation",
      filter: "awaiting",
      priority: 90,
    });
  }

  if (source.receiptsPending > 0) {
    items.push({
      id: "receipts-review",
      title: `${source.receiptsPending} receipt${source.receiptsPending === 1 ? "" : "s"} under review`,
      body: "Finance reviews each receipt by hand — you get an email with the outcome.",
      tone: "info",
      tab: "registration",
      filter: "review",
      priority: 60,
    });
  }

  if (source.awaitingPayment > 0) {
    items.push({
      id: "awaiting-payment",
      title: `${source.awaitingPayment} payment${source.awaitingPayment === 1 ? "" : "s"} outstanding`,
      body: "Registrations and accommodation still waiting for payment.",
      tone: "info",
      tab: "accommodation",
      filter: "awaiting",
      priority: 50,
    });
  }

  if (source.publishedRooms.length > 0) {
    const first = source.publishedRooms[0];
    items.push({
      id: "rooms-published",
      title: `Rooming list published for ${source.publishedRooms.length} room${source.publishedRooms.length === 1 ? "" : "s"}`,
      body:
        source.publishedRooms.length === 1
          ? `${first.name} — delegates confirm their room on arrival day.`
          : `${first.name} and ${source.publishedRooms.length - 1} more — delegates confirm their room on arrival day.`,
      tone: "success",
      tab: "accommodation",
      // "all" rather than no filter: the rooming card lives in the bookings
      // view on phones, and a filter is what switches to it.
      filter: "all",
      priority: 40,
    });
  }

  if (source.deadline !== null) {
    const daysLeft = Math.max(0, Math.ceil((source.deadline - now) / DAY));
    if (daysLeft <= 7) {
      items.push({
        id: "deadline-final-week",
        title:
          daysLeft === 0
            ? "Booking closes today"
            : `Booking closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        body: "New reservations and bed holds stop when the window closes.",
        tone: "warning",
        tab: "accommodation",
        filter: "all",
        priority: 70,
      });
    }
  }

  return items.sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
}

/** Feed entries the rep has not opened the bell for yet. */
export function unseenNotifications(
  items: RepNotification[],
  seenIds: string[],
): RepNotification[] {
  const seen = new Set(seenIds);
  return items.filter((item) => !seen.has(item.id));
}

/** Union of what was already seen and what is on screen now, capped. */
export function markNotificationsSeen(
  seenIds: string[],
  currentIds: string[],
): string[] {
  const merged = Array.from(new Set([...seenIds, ...currentIds]));
  return merged.slice(Math.max(0, merged.length - MAX_SEEN));
}

/** Tolerates a missing or hand-edited localStorage value. */
export function parseSeenIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}
