import { describe, expect, test } from "vitest";
import {
  buildRepNotifications,
  markNotificationsSeen,
  notificationSeenKey,
  parseSeenIds,
  unseenNotifications,
} from "../src/lib/repNotifications";
import type { NotificationSource } from "../src/lib/repNotifications";
import type { RepBooking } from "../src/lib/agcBookingTypes";

/** Pins the rep portal's header-bell feed and its unread bookkeeping. */

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = 1_000_000_000;

const booking = (overrides: Partial<RepBooking>): RepBooking => ({
  _id: "b1",
  referenceNumber: "AGC-1001",
  currency: "GHS",
  totalAmount: 450,
  paymentMode: "offline",
  paymentStatus: "awaiting_payment",
  bookingStatus: "reserved",
  expiresAt: null,
  adminMessage: null,
  offline: null,
  poa: null,
  createdAt: NOW - DAY,
  confirmedAt: null,
  guests: [
    {
      _id: "g1",
      firstName: "Kwame",
      lastName: "Mensah",
      gender: "male",
      title: "Mr.",
      accommodationType: "hostel",
      isBishopRate: false,
      status: "active",
    },
    {
      _id: "g2",
      firstName: "Ama",
      lastName: "Mensah",
      gender: "female",
      title: "Mrs.",
      accommodationType: "hostel",
      isBishopRate: false,
      status: "cancelled",
    },
  ],
  lines: [],
  ...overrides,
});

const source = (overrides: Partial<NotificationSource>): NotificationSource => ({
  bookings: [],
  receiptsPending: 0,
  awaitingPayment: 0,
  deadline: null,
  publishedRooms: [],
  now: NOW,
  ...overrides,
});

describe("buildRepNotifications", () => {
  test("a hold inside six hours is urgent and opens the awaiting list", () => {
    const [item] = buildRepNotifications(
      source({ bookings: [booking({ expiresAt: NOW + 2 * HOUR })] }),
    );
    expect(item).toMatchObject({
      id: "hold:b1",
      tone: "danger",
      tab: "accommodation",
      filter: "awaiting",
    });
    expect(item.title).toBe("Hold expires in 2h 0m");
    // Only active guests are counted in the body.
    expect(item.body).toContain("1 guest");
  });

  test("a hold later in the day is a warning, and expired holds are silent", () => {
    const items = buildRepNotifications(
      source({
        bookings: [
          booking({ _id: "soon", expiresAt: NOW + 20 * HOUR }),
          booking({ _id: "gone", expiresAt: NOW - HOUR }),
          booking({ _id: "closed", bookingStatus: "cancelled" }),
        ],
      }),
    );
    const holds = items.filter((item) => item.id.startsWith("hold:"));
    expect(holds).toHaveLength(1);
    expect(holds[0].tone).toBe("warning");
  });

  test("a bounced receipt asks for a new one", () => {
    const [item] = buildRepNotifications(
      source({
        bookings: [
          booking({ paymentStatus: "correction_requested" }),
          booking({ _id: "closed", bookingStatus: "expired", paymentStatus: "correction_requested" }),
        ],
      }),
    );
    expect(item).toMatchObject({ id: "correction:b1", tone: "warning" });
    expect(item.body).toContain("AGC-1001");
  });

  test("receipts under review and outstanding payments link to their lists", () => {
    const items = buildRepNotifications(
      source({ receiptsPending: 2, awaitingPayment: 3 }),
    );
    expect(items.find((item) => item.id === "receipts-review")).toMatchObject({
      tab: "registration",
      filter: "review",
      title: "2 receipts under review",
    });
    expect(items.find((item) => item.id === "awaiting-payment")).toMatchObject({
      tab: "accommodation",
      filter: "awaiting",
    });
  });

  test("published rooming is one aggregate item that opens the bookings view", () => {
    const items = buildRepNotifications(
      source({
        publishedRooms: [
          { roomId: "r1", name: "Block A" },
          { roomId: "r2", name: "Block B" },
        ],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "rooms-published",
      tone: "success",
      filter: "all",
    });
    expect(items[0].title).toContain("2 rooms");
    expect(items[0].body).toContain("Block A and 1 more");
  });

  test("the closing week is called out, later deadlines are not", () => {
    const dueSoon = buildRepNotifications(
      source({ deadline: NOW + 3 * DAY }),
    );
    expect(dueSoon[0].id).toBe("deadline-final-week");
    expect(dueSoon[0].title).toBe("Booking closes in 3 days");

    const later = buildRepNotifications(source({ deadline: NOW + 20 * DAY }));
    expect(later).toEqual([]);
  });

  test("orders by urgency: holds, corrections, deadline, review, payment, rooms", () => {
    const items = buildRepNotifications(
      source({
        bookings: [
          booking({ _id: "hold", expiresAt: NOW + 3 * HOUR }),
          booking({ _id: "fix", paymentStatus: "correction_requested" }),
        ],
        receiptsPending: 1,
        awaitingPayment: 1,
        deadline: NOW + 2 * DAY,
        publishedRooms: [{ roomId: "r1", name: "Block A" }],
      }),
    );
    expect(items.map((item) => item.id)).toEqual([
      "hold:hold",
      "correction:fix",
      "deadline-final-week",
      "receipts-review",
      "awaiting-payment",
      "rooms-published",
    ]);
  });
});

describe("seen bookkeeping", () => {
  test("only unseen ids come back", () => {
    const items = buildRepNotifications(
      source({
        receiptsPending: 1,
        publishedRooms: [{ roomId: "r1", name: "Block A" }],
      }),
    );
    expect(unseenNotifications(items, []).map((item) => item.id)).toEqual([
      "receipts-review",
      "rooms-published",
    ]);
    expect(
      unseenNotifications(items, ["receipts-review"]).map((item) => item.id),
    ).toEqual(["rooms-published"]);
  });

  test("marking read unions and de-duplicates, and the key is hub-scoped", () => {
    expect(markNotificationsSeen(["a", "b"], ["b", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(notificationSeenKey("accra")).not.toBe(notificationSeenKey("kumasi"));
  });

  test("the seen list is capped so storage cannot grow without bound", () => {
    const many = Array.from({ length: 210 }, (_, index) => `id-${index}`);
    const merged = markNotificationsSeen(many, ["newest"]);
    expect(merged).toHaveLength(200);
    expect(merged.at(-1)).toBe("newest");
    expect(merged[0]).toBe("id-11");
  });

  test("malformed seen values are ignored", () => {
    expect(parseSeenIds(null)).toEqual([]);
    expect(parseSeenIds("nope")).toEqual([]);
    expect(parseSeenIds('{"a":1}')).toEqual([]);
    expect(parseSeenIds('["a", 2, "b"]')).toEqual(["a", "b"]);
  });
});
