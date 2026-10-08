import { describe, expect, test } from "vitest";
import {
  accommodationExportRows,
  accommodationTypeLabel,
  type BookingExportSource,
} from "../src/lib/agcBookingExport";

/**
 * Pins the accommodation CSV row builder: the table only shows a guest count,
 * so the export must fan a booking out into one row per guest carrying the
 * guest's name, gender and accommodation type (labels, as shown in the
 * expanded row), plus the booking context on every row.
 */

const guest = (
  overrides: Partial<BookingExportSource["guests"][number]> = {},
) => ({
  title: "Mr.",
  firstName: "Kwame",
  lastName: "Mensah",
  gender: "male",
  accommodationType: "dormitory",
  isBishopRate: false,
  status: "active",
  ...overrides,
});

const booking = (
  overrides: Partial<BookingExportSource> = {},
): BookingExportSource => ({
  referenceNumber: "AGC-0001",
  hubName: "Accra Central",
  region: "ghana",
  bookingStatus: "confirmed",
  paymentStatus: "confirmed",
  paymentMode: "offline",
  totalAmount: 450,
  currency: "GHS",
  createdAt: 0,
  guests: [],
  ...overrides,
});

describe("accommodationExportRows", () => {
  test("fans a booking out to one row per guest with name, gender and type", () => {
    const rows = accommodationExportRows(
      booking({
        guests: [
          guest(),
          guest({
            title: "Mrs.",
            firstName: "Ama",
            lastName: "Owusu",
            gender: "female",
            accommodationType: "wise_serpents",
            isBishopRate: true,
          }),
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      reference: "AGC-0001",
      hub: "Accra Central",
      region: "ghana",
      title: "Mr.",
      firstName: "Kwame",
      lastName: "Mensah",
      gender: "male",
      phone: "",
      email: "",
      accommodationType: "Dormitory (Mighty Fortress)",
      bishopRate: "no",
      guestStatus: "active",
      bookingStatus: "confirmed",
      paymentStatus: "confirmed",
      paymentMode: "offline",
      total: 450,
      currency: "GHS",
      createdAt: new Date(0).toISOString(),
    });
    // Booking context repeats so the file is filterable per guest.
    expect(rows[1]).toMatchObject({
      hub: "Accra Central",
      firstName: "Ama",
      lastName: "Owusu",
      gender: "female",
      accommodationType: "Wise as Serpents Lodge",
      bishopRate: "yes",
      total: 450,
    });
  });

  test("guest contact info flows into the export when present", () => {
    const rows = accommodationExportRows(
      booking({
        guests: [
          guest({ phone: "+233 24 000 0000", email: "kwame@example.com" }),
        ],
      }),
    );
    expect(rows[0]).toMatchObject({
      phone: "+233 24 000 0000",
      email: "kwame@example.com",
    });
  });

  test("a booking with no guests still exports one row", () => {
    const rows = accommodationExportRows(booking());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reference: "AGC-0001",
      firstName: "",
      gender: "",
      phone: "",
      email: "",
      accommodationType: "",
      bookingStatus: "confirmed",
    });
  });

  test("every guest status is exported, not just active ones", () => {
    const rows = accommodationExportRows(
      booking({
        guests: [
          guest(),
          guest({
            firstName: "Kojo",
            status: "cancelled",
            accommodationType: "hostel",
          }),
        ],
      }),
    );
    expect(rows.map((row) => row.guestStatus)).toEqual(["active", "cancelled"]);
  });
});

describe("accommodationTypeLabel", () => {
  test("maps known types to their event labels and passes through unknowns", () => {
    expect(accommodationTypeLabel("ebpv")).toBe("EBPV Apartment");
    expect(accommodationTypeLabel("good_general")).toBe("Good General Lodge");
    expect(accommodationTypeLabel("mystery")).toBe("mystery");
  });
});
