import { describe, expect, test } from "vitest";
import {
  AGC_ACCOMMODATION_TYPES,
  amountsMatch,
  bookingCurrency,
  capacityProblem,
  computeBookingSummary,
  describeUnits,
  typesConfigFromOverview,
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

  test("lodges: every type is per-bed, one unit per guest", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
      ],
      "england",
    );
    // 3 guests → 3 beds (all types are per-bed now).
    expect(summary.lines[0]).toMatchObject({
      guests: 3,
      units: 3,
      unitLabel: "bed",
      unitPrice: 210,
      subtotal: 630,
    });
    expect(summary.totalAmount).toBe(630);
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
    expect(standard).toMatchObject({ guests: 2, units: 2, unitPrice: 6200, subtotal: 12400 });
    expect(summary.totalAmount).toBe(13900);
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

  test("beds compare units one-to-one with guest count", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
        { accommodationType: "wise_serpents", isBishopRate: false },
      ],
      "england",
    );
    expect(summary.lines[0].units).toBe(3);
    expect(capacityProblem(summary, availability)).toContain("needs 3");
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
    expect(describeUnits(summary)).toBe("2 beds · 1 bed");
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

test("config sanity: every type is per-bed with occupancy one", () => {
  for (const [type, config] of Object.entries(AGC_ACCOMMODATION_TYPES)) {
    expect(config.unit).toBe("bed");
    expect(config.maxOccupancy).toBe(1);
    expect(type).toMatch(/^[a-z_]+$/);
  }
});

/**
 * Server-provided prices (getAccommodationOverview) must flow into the
 * form's pre-submit totals so they always match what the server will charge.
 */

describe("typesConfigFromOverview", () => {
  test("merges server rows over catalog defaults", () => {
    const config = typesConfigFromOverview([
      {
        type: "dormitory",
        label: "Dorm (renamed)",
        unit: "bed",
        maxOccupancy: 1,
        pricing: { ghs: 175, usd: 18 },
      },
    ]);
    expect(config.dormitory.pricing).toEqual({ ghs: 175, usd: 18 });
    expect(config.dormitory.label).toBe("Dorm (renamed)");
    // Untouched types keep their catalog values.
    expect(config.hostel.pricing).toEqual({ ghs: 450, usd: 40 });
  });

  test("always returns the full catalog: missing types keep defaults, unknown rows are dropped", () => {
    const config = typesConfigFromOverview([
      {
        type: "not_a_type",
        label: "Ghost",
        unit: "bed",
        maxOccupancy: 1,
        pricing: { ghs: 1, usd: 1 },
      },
    ]);
    expect(Object.keys(config).sort()).toEqual(
      Object.keys(AGC_ACCOMMODATION_TYPES).sort(),
    );
    expect(config.dormitory.pricing).toEqual({ ghs: 150, usd: 15 });
  });

  test("empty or undefined rows fall back to the catalog", () => {
    expect(typesConfigFromOverview([])).toEqual(AGC_ACCOMMODATION_TYPES);
    expect(typesConfigFromOverview(undefined)).toEqual(AGC_ACCOMMODATION_TYPES);
  });
});

describe("computeBookingSummary with live overview config", () => {
  const liveTypes = typesConfigFromOverview([
    {
      type: "hostel",
      label: "Hostel",
      unit: "bed",
      maxOccupancy: 1,
      pricing: { ghs: 500, usd: 45 },
    },
  ]);

  test("admin-edited GHS price drives the pre-submit total", () => {
    const summary = computeBookingSummary(
      [
        { accommodationType: "hostel", isBishopRate: false },
        { accommodationType: "hostel", isBishopRate: false },
      ],
      "ghana",
      liveTypes,
    );
    expect(summary.lines[0].unitPrice).toBe(500);
    expect(summary.totalAmount).toBe(1000);
  });

  test("admin-edited USD price is used in non-GHS regions", () => {
    const summary = computeBookingSummary(
      [{ accommodationType: "hostel", isBishopRate: false }],
      "england",
      liveTypes,
    );
    expect(summary.lines[0].unitPrice).toBe(45);
    expect(summary.totalAmount).toBe(45);
  });

  test("admin-edited bishop rate drives EBPV bishop lines", () => {
    const summary = computeBookingSummary(
      [{ accommodationType: "ebpv", isBishopRate: true }],
      "ghana",
      AGC_ACCOMMODATION_TYPES,
      { ghs: 1600, usd: 150 },
    );
    expect(summary.lines[0].unitPrice).toBe(1600);
  });
});

describe("capacityProblem with live types", () => {
  test("shortfall messages use the admin-edited label", () => {
    const types = typesConfigFromOverview([
      {
        type: "hostel",
        label: "Hostel Annex",
        unit: "bed",
        maxOccupancy: 1,
        pricing: { ghs: 450, usd: 40 },
      },
    ]);
    const summary = computeBookingSummary(
      [
        { accommodationType: "hostel", isBishopRate: false },
        { accommodationType: "hostel", isBishopRate: false },
        { accommodationType: "hostel", isBishopRate: false },
      ],
      "ghana",
      types,
    );
    const problem = capacityProblem(
      summary,
      [{ accommodationType: "hostel", available: 2 }],
      types,
    );
    expect(problem).toContain("Hostel Annex");
    expect(problem).toContain("Only 2 beds left");
  });
});
