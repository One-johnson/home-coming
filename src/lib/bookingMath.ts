/**
 * Browser-safe mirror of the server's booking math (convex/agcAccommodation.ts
 * `computeBookingLines` + convex/lib/agcConfig.ts pricing) so the booking form
 * can show live totals, unit counts, and capacity hints that match exactly
 * what the server will compute and charge.
 */

/**
 * Exact-amount rule: offline payments must equal the system total — nothing
 * less, nothing more. Tolerance only covers float rounding (half a cent).
 */
export function amountsMatch(entered: number, expected: number): boolean {
  return Math.abs(entered - expected) < 0.005;
}

export type AgcAccommodationType =
  | "dormitory"
  | "hostel"
  | "wise_serpents"
  | "good_general"
  | "ebpv";

export type AgcRegion =
  | "ghana"
  | "west_africa"
  | "rest_of_africa"
  | "north_america"
  | "england"
  | "switzerland"
  | "rest_of_europe"
  | "rest_of_world";

export type AccommodationTypeConfig = {
  label: string;
  unit: "bed";
  maxOccupancy: number;
  pricing: { ghs: number; usd: number };
};

/**
 * Mirror of convex/lib/agcConfig.ts AGC_ACCOMMODATION_TYPES defaults.
 * Every type is priced per bed (1 guest = 1 unit). Admins can override
 * prices/labels at runtime (agcSettings); the portal then renders the live
 * values from getAccommodationOverview, and the server always re-prices
 * bookings authoritatively at submit time.
 */
export const AGC_ACCOMMODATION_TYPES: Record<
  AgcAccommodationType,
  AccommodationTypeConfig
> = {
  dormitory: {
    label: "Dormitory (Mighty Fortress)",
    unit: "bed",
    maxOccupancy: 1,
    pricing: { ghs: 150, usd: 15 },
  },
  hostel: {
    label: "Hostel (Blocks 1–8)",
    unit: "bed",
    maxOccupancy: 1,
    pricing: { ghs: 450, usd: 40 },
  },
  wise_serpents: {
    label: "Wise as Serpents Lodge",
    unit: "bed",
    maxOccupancy: 1,
    pricing: { ghs: 2500, usd: 210 },
  },
  good_general: {
    label: "Good General Lodge",
    unit: "bed",
    maxOccupancy: 1,
    pricing: { ghs: 5000, usd: 420 },
  },
  ebpv: {
    label: "EBPV Apartment",
    unit: "bed",
    maxOccupancy: 1,
    pricing: { ghs: 6200, usd: 520 },
  },
};

/** Must mirror convex/lib/agcConfig.ts AGC_BISHOP_RATE. */
export const AGC_BISHOP_RATE = { ghs: 1500, usd: 140 } as const;

export type GuestDraft = {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  title: string;
  accommodationType: AgcAccommodationType;
  isBishopRate: boolean;
};

export type SummaryLine = {
  accommodationType: AgcAccommodationType;
  isBishopRate: boolean;
  /** Number of guests grouped into this line. */
  guests: number;
  /** Beds (1/guest) or rooms (ceil(guests / maxOccupancy)). */
  units: number;
  unitLabel: string;
  unitPrice: number;
  subtotal: number;
};

export type BookingSummary = {
  currency: "GHS" | "USD";
  lines: SummaryLine[];
  totalUnits: number;
  totalAmount: number;
};

export function isGhsRegion(region: AgcRegion): boolean {
  return region === "ghana" || region === "west_africa";
}

export function bookingCurrency(region: AgcRegion): "GHS" | "USD" {
  return isGhsRegion(region) ? "GHS" : "USD";
}

/**
 * Unit price for one bed, mirroring the server's per-bed pricing rule.
 * `types`/`bishop` accept live overview config; defaults are the catalog.
 */
export function unitPrice(
  type: AgcAccommodationType,
  region: AgcRegion,
  isBishopRate = false,
  types: Record<
    AgcAccommodationType,
    AccommodationTypeConfig
  > = AGC_ACCOMMODATION_TYPES,
  bishop: { ghs: number; usd: number } = AGC_BISHOP_RATE,
): number {
  const ghs = isGhsRegion(region);
  const config = types[type];
  if (isBishopRate && type === "ebpv") {
    return ghs ? bishop.ghs : bishop.usd;
  }
  return ghs ? config.pricing.ghs : config.pricing.usd;
}

/**
 * Row shape served by getAccommodationOverview (`accommodationTypes` entries).
 * Structural — keeps this module import-free so it stays a browser-safe mirror.
 */
export type AccommodationTypeRow = {
  type: string;
  label: string;
  unit: "bed" | "room";
  maxOccupancy: number;
  pricing: { ghs: number; usd: number };
};

/**
 * Build the live types config from the server overview so pre-submit totals
 * reflect admin-edited prices. Rows override catalog entries by type; anything
 * missing or unknown keeps its catalog default, so the result is always a
 * complete Record (the server remains the pricing authority at submit time).
 */
export function typesConfigFromOverview(
  rows: ReadonlyArray<AccommodationTypeRow> | undefined,
): Record<AgcAccommodationType, AccommodationTypeConfig> {
  const merged: Record<AgcAccommodationType, AccommodationTypeConfig> = {
    ...AGC_ACCOMMODATION_TYPES,
  };
  if (!rows) return merged;
  for (const row of rows) {
    const type = row.type as AgcAccommodationType;
    if (row.type in merged && row.pricing) {
      merged[type] = {
        label: row.label || merged[type].label,
        unit: "bed",
        maxOccupancy: 1,
        pricing: { ...row.pricing },
      };
    }
  }
  return merged;
}

/**
 * Group guests into priced lines exactly like the server does, so the form's
 * live summary equals what `createBooking` will compute and charge.
 */
export function computeBookingSummary(
  guests: Array<Pick<GuestDraft, "accommodationType" | "isBishopRate">>,
  region: AgcRegion,
  types: Record<
    AgcAccommodationType,
    AccommodationTypeConfig
  > = AGC_ACCOMMODATION_TYPES,
  bishop: { ghs: number; usd: number } = AGC_BISHOP_RATE,
): BookingSummary {
  const groups = new Map<string, number>();
  for (const guest of guests) {
    const key = `${guest.accommodationType}|${guest.isBishopRate ? "bishop" : "standard"}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  const lines: SummaryLine[] = [];
  for (const [key, guestsInGroup] of groups) {
    const [type, rate] = key.split("|");
    const accommodationType = type as AgcAccommodationType;
    const isBishopRate = rate === "bishop";
    const config = types[accommodationType];
    // Every type is per-bed — one unit per guest (server parity).
    const units = guestsInGroup;
    const price = unitPrice(accommodationType, region, isBishopRate, types, bishop);
    lines.push({
      accommodationType,
      isBishopRate,
      guests: guestsInGroup,
      units,
      unitLabel: config.unit,
      unitPrice: price,
      subtotal: units * price,
    });
  }

  return {
    currency: bookingCurrency(region),
    lines,
    totalUnits: lines.reduce((sum, line) => sum + line.units, 0),
    totalAmount: lines.reduce((sum, line) => sum + line.subtotal, 0),
  };
}

/**
 * Capacity problem for the computed lines, or null when everything fits.
 * `types` accepts the live overview config so shortfall messages use the
 * admin-edited labels; defaults are the catalog.
 */
export function capacityProblem(
  summary: BookingSummary,
  availability: Array<{ accommodationType: string; available: number }>,
  types: Record<
    AgcAccommodationType,
    AccommodationTypeConfig
  > = AGC_ACCOMMODATION_TYPES,
): string | null {
  for (const line of summary.lines) {
    const row = availability.find((a) => a.accommodationType === line.accommodationType);
    if (row && row.available < line.units) {
      const config = types[line.accommodationType] ?? AGC_ACCOMMODATION_TYPES[line.accommodationType];
      return `Only ${row.available} ${row.available === 1 ? config.unit : config.unit + "s"} left in ${config.label}, but the booking needs ${line.units}.`;
    }
  }
  return null;
}

/** Human summary like "2 dorm beds · 1 EBPV bed". */
export function describeUnits(summary: BookingSummary): string {
  return summary.lines
    .map(
      (line) =>
        `${line.units} ${line.unitLabel}${line.units === 1 ? "" : "s"}`,
    )
    .join(" · ");
}
