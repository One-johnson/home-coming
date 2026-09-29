import { describe, expect, test } from "vitest";
import {
  displayPaymentStatus,
  guestAvatarClass,
  guestInitials,
  guestRosterRows,
  isClosedBooking,
} from "../src/lib/agcBookingView";
import type { RepBooking } from "../src/lib/agcBookingTypes";

/**
 * Pins the accommodation-tab display rules: cancelled/expired bookings must
 * not carry the "Awaiting payment" tag, and the roster table flattens active
 * guests in booking order.
 */

const baseBooking = (overrides: Partial<RepBooking>): RepBooking => ({
  _id: "b1",
  referenceNumber: "AGC-0001",
  currency: "GHS",
  totalAmount: 450,
  paymentMode: "offline",
  paymentStatus: "awaiting_payment",
  bookingStatus: "reserved",
  expiresAt: null,
  adminMessage: null,
  offline: null,
  createdAt: 0,
  confirmedAt: null,
  guests: [],
  lines: [],
  ...overrides,
});

const guest = (
  id: string,
  overrides: Partial<RepBooking["guests"][number]> = {},
) => ({
  _id: id,
  firstName: "Ama",
  lastName: "Mensah",
  gender: "female",
  title: "Mrs.",
  accommodationType: "dormitory",
  isBishopRate: false,
  status: "active",
  ...overrides,
});

describe("displayPaymentStatus", () => {
  test("closed bookings never show awaiting payment", () => {
    for (const bookingStatus of ["cancelled", "expired"] as const) {
      const booking = baseBooking({
        bookingStatus,
        paymentStatus: "awaiting_payment",
      });
      expect(isClosedBooking(booking)).toBe(true);
      const meta = displayPaymentStatus(booking);
      expect(meta.label).not.toBe("Awaiting payment");
      expect(meta.label).toBe("Not paid");
    }
  });

  test("cancelled booking keeps cancelled payment substates hidden too", () => {
    const booking = baseBooking({
      bookingStatus: "cancelled",
      paymentStatus: "pending_verification",
    });
    expect(displayPaymentStatus(booking).label).toBe("Not paid");
  });

  test("open bookings keep their real payment status", () => {
    for (const paymentStatus of [
      "awaiting_payment",
      "confirmed",
      "pending_verification",
      "correction_requested",
      "rejected",
    ] as const) {
      const meta = displayPaymentStatus(
        baseBooking({ bookingStatus: "reserved", paymentStatus }),
      );
      expect(meta.label).toBe(
        {
          awaiting_payment: "Awaiting payment",
          confirmed: "Confirmed",
          pending_verification: "Under review",
          correction_requested: "Correction requested",
          rejected: "Rejected",
        }[paymentStatus],
      );
    }
  });

  test("confirmed bookings keep the confirmed payment badge", () => {
    const booking = baseBooking({
      bookingStatus: "confirmed",
      paymentStatus: "confirmed",
    });
    expect(isClosedBooking(booking)).toBe(false);
    expect(displayPaymentStatus(booking).label).toBe("Confirmed");
  });
});

describe("guestRosterRows", () => {
  test("flattens active guests across bookings in booking order", () => {
    const bookings = [
      baseBooking({
        _id: "b2",
        referenceNumber: "AGC-0002",
        guests: [guest("g3"), guest("g4", { status: "substituted" })],
      }),
      baseBooking({
        _id: "b1",
        referenceNumber: "AGC-0001",
        guests: [guest("g1"), guest("g2", { gender: "male" })],
      }),
    ];
    const rows = guestRosterRows(bookings);
    expect(rows.map((row) => row.guest._id)).toEqual(["g3", "g1", "g2"]);
    expect(rows[0].booking.referenceNumber).toBe("AGC-0002");
    expect(rows.every((row) => row.guest.status === "active")).toBe(true);
  });

  test("returns an empty array for bookings without guests", () => {
    expect(guestRosterRows([baseBooking({})])).toEqual([]);
  });
});

describe("guestInitials", () => {
  test("builds two-letter initials, tolerant of blanks", () => {
    expect(guestInitials({ firstName: "Kwame", lastName: "Mensah" })).toBe("KM");
    expect(guestInitials({ firstName: "ama", lastName: "boatswain" })).toBe("AB");
    expect(guestInitials({ firstName: "  ", lastName: "  " })).toBe("?");
  });
});

describe("guestAvatarClass", () => {
  test("same guest always gets the same chip color", () => {
    const g = { firstName: "Kwame", lastName: "Mensah", gender: "male" };
    expect(guestAvatarClass(g)).toBe(guestAvatarClass(g));
  });

  test("male and female guests draw from different palettes", () => {
    const male = { firstName: "Kojo", lastName: "Ann", gender: "male" };
    const female = { firstName: "Ama", lastName: "Boat", gender: "female" };
    expect(guestAvatarClass(male)).not.toBe(guestAvatarClass(female));
  });
});
