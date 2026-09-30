import { describe, expect, test } from "vitest";
import {
  AGC_ACCOMMODATION_TYPES,
  amountsMatch,
  bookingCurrency,
  capacityProblem,
  computeBookingSummary,
  describeUnits,
  unitPrice,
} from "../src/lib/bookingMath";

/**
 * The form's live summary must equal what the server computes and charges —
 * these tests pin the grouping, room-share, bishop-rate, and currency rules.
 */

describe("bookingCurrency", () => {
  test("GHS for ghana and west_africa, USD elsewhere", () => {
    expect(bookingCurrency("ghana")).toBe("GHS");
    expect(bookingCurrency("west_africa")).toBe("GHS");
    expect(bookingCurrency("england")).toBe("USD");
    expect(bookingCurrency("north_america")).toBe("USD");
    expect(bookingCurrency("rest_of_world")).toBe("USD");
  });
});

describe("unitPrice", () => {
  test("standard prices mirror the server config in both currencies", () => {
    expect(unitPrice("dormitory", "ghana")).toBe(150);
    expect(unitPrice("dormitory", "england")).toBe(15);
    expect(unitPrice("hostel", "ghana")).toBe(450);
    expect(unitPrice("hostel", "england")).toBe(40);
    expect(unitPrice("wise_serpents", "ghana")).toBe(2500);
    expect(unitPrice("good_general", "england")).toBe(420);
    expect(unitPrice("ebpv", "ghana")).toBe(6200);
    expect(unitPrice("ebpv", "england")).toBe(520);
  });

  test("bishop rate applies only to EBPV", () => {
    expect(unitPrice("ebpv", "ghana", true)).toBe(1500);
    expect(unitPrice("ebpv", "england", true)).toBe(140);
    // Non-EBPV types ignore the bishop flag (server behavior).
    expect(unitPrice("dormitory", "ghana", true)).toBe(150);
    expect(unitPrice("hostel", "england", true)).toBe(40);
  });
});

describe("computeBookingSummary", () => {
  test("beds: one unit per guest", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "dormitory", isBishopRate: false },
        { accommodationType: "dormitory", isBishopRate: false },
        { accommodationType: "dormitory", isBishopRate: false },
      ],
      "ghana",
    );
    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]).toMatchObject({
      accommodationType: "dormitory",
      guests: 3,
      units: 3,
      unitLabel: "bed",
      unitPrice: 150,
      subtotal: 450,
    });
    expect(summary.totalAmount).toBe(450);
    expect(summary.currency).toBe("GHS");
  });

  test("rooms: guests share two per room, rounded up", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
      ],
      "england",
    );
    // 3 guests → 2 rooms (2 + 1).
    expect(summary.lines[0]).toMatchObject({
      guests: 3,
      units: 2,
      unitLabel: "room",
      unitPrice: 210,
      subtotal: 420,
    });
    expect(summary.totalAmount).toBe(420);
  });

  test("same type splits into standard and bishop lines", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "ebpv", isBishopRate: true },
        { accommodationType: "ebpv", isBishopRate: false },
        { accommodationType: "ebpv", isBishopRate: false },
      ],
      "ghana",
    );
    expect(summary.lines).toHaveLength(2);
    const bishop = summary.lines.find((l) => l.isBishopRate);
    const standard = summary.lines.find((l) => !l.isBishopRate);
    expect(bishop).toMatchObject({ guests: 1, units: 1, unitPrice: 1500, subtotal: 1500 });
    expect(standard).toMatchObject({ guests: 2, units: 1, unitPrice: 6200, subtotal: 6200 });
    expect(summary.totalAmount).toBe(7700);
  });

  test("empty guest list yields a zeroed summary", () => {
    const summary = computeBookingSummary([], "ghana");
    expect(summary.lines).toHaveLength(0);
    expect(summary.totalUnits).toBe(0);
    expect(summary.totalAmount).toBe(0);
  });
});

describe("capacityProblem", () => {
  const availability = [
    { accommodationType: "dormitory", available: 10 },
    { accommodationType: "hostel", available: 2 },
    { accommodationType: "wise_serpents", available: 1 },
  ];

  test("null when everything fits", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "dormitory", isBishopRate: false },
        { accommodationType: "hostel", isBishopRate: false },
        { accommodationType: "hostel", isBishopRate: false },
      ],
      "ghana",
    );
    expect(capacityProblem(summary, availability)).toBeNull();
  });

  test("describes the shortfall when demand exceeds availability", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "hostel", isBishopRate: false },
        { accommodationType: "hostel", isBishopRate: false },
        { accommodationType: "hostel", isBishopRate: false },
      ],
      "ghana",
    );
    const problem = capacityProblem(summary, availability);
    expect(problem).toContain("Only 2 beds left");
    expect(problem).toContain("needs 3");
  });

  test("rooms compare units, not guest count (3 guests fit 2 rooms)", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
      ],
      "england",
    );
    expect(summary.lines[0].units).toBe(2);
    expect(capacityProblem(summary, availability)).toContain("needs 2");
  });

  test("unknown types (stale availability) are ignored rather than crashing", () => {
    const summary = computeBookingSummary(
      [{ accommodationType: "ebpv", isBishopRate: false }],
      "ghana",
    );
    expect(capacityProblem(summary, availability)).toBeNull();
  });
});

describe("describeUnits", () => {
  test("joins unit counts with singular/plural handling", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "dormitory", isBishopRate: false },
        { accommodationType: "dormitory", isBishopRate: false },
        { accommodationType: "ebpv", isBishopRate: false },
      ],
      "ghana",
    );
    expect(describeUnits(summary)).toBe("2 beds · 1 room");
  });
});

describe("amountsMatch (exact-amount rule)", () => {
  test("exact totals pass", () => {
    expect(amountsMatch(450, 450)).toBe(true);
    expect(amountsMatch(0, 0)).toBe(true);
  });

  test("anything less or more is rejected", () => {
    expect(amountsMatch(449.99, 450)).toBe(false);
    expect(amountsMatch(450.01, 450)).toBe(false);
    expect(amountsMatch(449, 450)).toBe(false);
    expect(amountsMatch(451, 450)).toBe(false);
    expect(amountsMatch(0, 450)).toBe(false);
  });

  test("float rounding within half a cent still matches", () => {
    expect(amountsMatch(450.004, 450)).toBe(true);
    expect(amountsMatch(449.996, 450)).toBe(true);
  });
});

test("config sanity: room types hold two, bed types hold one", () => {
  for (const [type, config] of Object.entries(AGC_ACCOMMODATION_TYPES)) {
    if (config.unit === "bed") expect(config.maxOccupancy).toBe(1);
    else expect(config.maxOccupancy).toBe(2);
    expect(type).toMatch(/^[a-z_]+$/);
  }
});
