import { describe, expect, test } from "vitest";
import {
  attentionSummary,
  draftStorageKey,
  expiringHolds,
  formatHoldLeft,
  nextSort,
  parseStoredDrafts,
  serializeDrafts,
  sortBookings,
} from "../src/lib/portalBookingsUx";
import type { BookingDraft, BookingSort } from "../src/lib/portalBookingsUx";
import { parseRosterPaste } from "../src/lib/portalRosterPaste";
import type { RepBooking } from "../src/lib/agcBookingTypes";

/** Pins the rep portal's paste-a-roster and desktop/mobile view helpers. */

const HOUR = 3_600_000;

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
  createdAt: 1_000,
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
  ],
  lines: [],
  ...overrides,
});

const draft = (overrides: Partial<BookingDraft>): BookingDraft => ({
  firstName: "Kwame",
  lastName: "Mensah",
  gender: "male",
  title: "Mr.",
  accommodationType: "hostel",
  isBishopRate: false,
  ...overrides,
});

describe("parseRosterPaste", () => {
  test("reads a plain name into first and last", () => {
    const { drafts, errors } = parseRosterPaste("Kwame Mensah");
    expect(errors).toEqual([]);
    expect(drafts).toEqual([
      {
        firstName: "Kwame",
        lastName: "Mensah",
        title: "Member",
        gender: "male",
        accommodationType: null,
        isBishopRate: false,
      },
    ]);
  });

  test("splits title, gender and room type out of comma cells", () => {
    const { drafts, errors } = parseRosterPaste(
      "Mrs Mary Mensah, female, Hostel\nMr John Doe, M, EBPV",
    );
    expect(errors).toEqual([]);
    expect(drafts[0]).toMatchObject({
      firstName: "Mary",
      lastName: "Mensah",
      title: "Mrs.",
      gender: "female",
      accommodationType: "hostel",
    });
    expect(drafts[1]).toMatchObject({
      firstName: "John",
      lastName: "Doe",
      title: "Mr.",
      gender: "male",
      accommodationType: "ebpv",
    });
  });

  test("handles numbering, bullets, tabs and a title glued to the name", () => {
    const { drafts, errors } = parseRosterPaste(
      "1. Pastor Ama Owusu\n- Ama Serwaa, EBPV Apartment, F\n•\tBishop Kofi Boateng\tbishop rate",
    );
    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toMatchObject({ firstName: "Ama", lastName: "Owusu", title: "Pastor" });
    expect(drafts[1]).toMatchObject({
      firstName: "Ama",
      lastName: "Serwaa",
      gender: "female",
      accommodationType: "ebpv",
    });
    expect(drafts[2]).toMatchObject({
      firstName: "Kofi",
      lastName: "Boateng",
      title: "Bishop",
      isBishopRate: true,
    });
  });

  test("reads em-dash lists and a bracketed gender", () => {
    const { drafts, errors } = parseRosterPaste(
      "Mrs Mary Mensah — female — EBPV — bishop rate\nJohn Doe (M)\nAma Serwaa (F), Hostel",
    );
    expect(errors).toEqual([]);
    expect(drafts[0]).toMatchObject({
      firstName: "Mary",
      lastName: "Mensah",
      gender: "female",
      accommodationType: "ebpv",
      isBishopRate: true,
    });
    expect(drafts[1]).toMatchObject({
      firstName: "John",
      lastName: "Doe",
      gender: "male",
    });
    expect(drafts[2]).toMatchObject({
      firstName: "Ama",
      lastName: "Serwaa",
      gender: "female",
      accommodationType: "hostel",
    });
  });

  test("flags a missing last name but still keeps the row", () => {
    const { drafts, errors } = parseRosterPaste("Kwame");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ firstName: "Kwame", lastName: "" });
    expect(errors).toEqual(["Line 1: add a last name for Kwame."]);
  });

  test("skips blank lines and comments", () => {
    const { drafts, errors } = parseRosterPaste("\n# delegates\n\nAma Owusu\n");
    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(1);
  });
});

describe("saved drafts", () => {
  test("round-trips and scopes the key to the hub", () => {
    const rows = [draft({}), draft({ firstName: "Ama", gender: "female" })];
    expect(parseStoredDrafts(serializeDrafts(rows))).toEqual(rows);
    expect(draftStorageKey("accra_hub")).not.toBe(draftStorageKey("kumasi_hub"));
  });

  test("drops malformed values instead of throwing", () => {
    expect(parseStoredDrafts(null)).toEqual([]);
    expect(parseStoredDrafts("not json")).toEqual([]);
    expect(parseStoredDrafts('{"firstName":"Kwame"}')).toEqual([]);
    expect(parseStoredDrafts('[null, {"firstName": 1}]')).toEqual([]);
  });

  test("falls back to a known room type and default title", () => {
    const restored = parseStoredDrafts(
      JSON.stringify([{ firstName: "Ama", lastName: "Owusu", accommodationType: "igloo" }]),
    );
    expect(restored[0]).toMatchObject({
      accommodationType: "dormitory",
      title: "Member",
      gender: "male",
      isBishopRate: false,
    });
  });
});

describe("expiringHolds / attentionSummary", () => {
  const now = 1_000_000;

  test("keeps only reserved holds inside the window, soonest first", () => {
    const rows = [
      booking({ _id: "later", expiresAt: now + 20 * HOUR }),
      booking({ _id: "soon", expiresAt: now + 2 * HOUR }),
      booking({ _id: "gone", expiresAt: now - HOUR }),
      booking({ _id: "confirmed", bookingStatus: "confirmed", expiresAt: now + HOUR }),
      booking({ _id: "no-window", expiresAt: null }),
    ];
    expect(expiringHolds(rows, now).map((row) => row.booking._id)).toEqual([
      "soon",
      "later",
    ]);
  });

  test("counts soon holds and corrections", () => {
    const rows = [
      booking({ _id: "a", expiresAt: now + HOUR }),
      booking({ _id: "b", expiresAt: now + 10 * HOUR }),
      booking({ _id: "c", paymentStatus: "correction_requested" }),
      booking({
        _id: "d",
        bookingStatus: "cancelled",
        paymentStatus: "correction_requested",
      }),
    ];
    const summary = attentionSummary(rows, now);
    expect(summary.expiring).toBe(2);
    expect(summary.urgent).toBe(1);
    expect(summary.corrections).toBe(1);
    expect(summary.soonest?.booking._id).toBe("a");
  });

  test("formats a countdown compactly", () => {
    expect(formatHoldLeft(45 * 60_000)).toBe("45m");
    expect(formatHoldLeft(5 * HOUR + 12 * 60_000)).toBe("5h 12m");
    expect(formatHoldLeft(3 * 24 * HOUR + 4 * HOUR)).toBe("3d 4h");
    expect(formatHoldLeft(0)).toBe("expired");
  });
});

describe("sortBookings / nextSort", () => {
  const rows = [
    booking({ _id: "a", referenceNumber: "AGC-10", totalAmount: 900, expiresAt: 500 }),
    booking({ _id: "b", referenceNumber: "AGC-9", totalAmount: 150, expiresAt: null }),
    booking({ _id: "c", referenceNumber: "AGC-100", totalAmount: 450, expiresAt: 200 }),
  ];

  test("sorts by total and by reference numerically", () => {
    expect(sortBookings(rows, { key: "total", direction: "asc" }).map((r) => r._id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(
      sortBookings(rows, { key: "reference", direction: "asc" }).map((r) => r.referenceNumber),
    ).toEqual(["AGC-9", "AGC-10", "AGC-100"]);
  });

  test("keeps bookings without a hold window last in both directions", () => {
    expect(sortBookings(rows, { key: "expiry", direction: "asc" }).map((r) => r._id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(sortBookings(rows, { key: "expiry", direction: "desc" }).map((r) => r._id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("first click sorts ascending, second flips the same column", () => {
    const start: BookingSort = { key: "reference", direction: "asc" };
    const total = nextSort(start, "total");
    expect(total).toEqual({ key: "total", direction: "asc" });
    expect(nextSort(total, "total")).toEqual({ key: "total", direction: "desc" });
    expect(nextSort(start, "expiry", "desc")).toEqual({ key: "expiry", direction: "desc" });
  });
});
