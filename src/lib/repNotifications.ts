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
const PREFS_PREFIX = "agc.portal.notifications.prefs.";
const MAX_SEEN = 200;
const MAX_DISMISSED = 200;

export function notificationSeenKey(hubUsername: string): string {
  return `${SEEN_PREFIX}${hubUsername}`;
}

/** What the rep did with the feed: dismissed, or postponed for a while. */
export type NotificationPrefs = {
  dismissed: string[];
  /** id -> epoch ms the notification comes back. */
  snoozed: Record<string, number>;
};

export function notificationPrefsKey(hubUsername: string): string {
  return `${PREFS_PREFIX}${hubUsername}`;
}

export function emptyNotificationPrefs(): NotificationPrefs {
  return { dismissed: [], snoozed: {} };
}

export function parseNotificationPrefs(raw: string | null): NotificationPrefs {
  if (!raw) return emptyNotificationPrefs();
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") return emptyNotificationPrefs();
    const dismissed = Array.isArray(value.dismissed)
      ? value.dismissed.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    const snoozed: Record<string, number> = {};
    if (value.snoozed && typeof value.snoozed === "object") {
      for (const [id, until] of Object.entries(
        value.snoozed as Record<string, unknown>,
      )) {
        if (typeof until === "number" && Number.isFinite(until)) {
          snoozed[id] = until;
        }
      }
    }
    return { dismissed, snoozed };
  } catch {
    return emptyNotificationPrefs();
  }
}

/** Drops snoozes that have already lapsed, so storage cannot grow forever. */
function pruneSnoozes(
  snoozed: Record<string, number>,
  now: number,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(snoozed).filter(([, until]) => until > now),
  );
}

/** Feed entries the rep has not dismissed or snoozed away. */
export function visibleNotifications(
  items: RepNotification[],
  prefs: NotificationPrefs,
  now: number,
): RepNotification[] {
  const dismissed = new Set(prefs.dismissed);
  return items.filter(
    (item) =>
      !dismissed.has(item.id) && !((prefs.snoozed[item.id] ?? 0) > now),
  );
}

export function dismissNotification(
  prefs: NotificationPrefs,
  id: string,
  now: number,
): NotificationPrefs {
  const dismissed = Array.from(new Set([...prefs.dismissed, id]));
  return {
    dismissed: dismissed.slice(Math.max(0, dismissed.length - MAX_DISMISSED)),
    snoozed: pruneSnoozes(prefs.snoozed, now),
  };
}

export const SNOOZE_MS = 4 * HOUR;

export function snoozeNotification(
  prefs: NotificationPrefs,
  id: string,
  now: number,
  durationMs: number = SNOOZE_MS,
): NotificationPrefs {
  return {
    dismissed: prefs.dismissed,
    snoozed: { ...pruneSnoozes(prefs.snoozed, now), [id]: now + durationMs },
  };
}

/** Bring every dismissed entry back (the safety valve for a mis-tap). */
export function restoreDismissedNotifications(
  prefs: NotificationPrefs,
): NotificationPrefs {
  return { dismissed: [], snoozed: prefs.snoozed };
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
