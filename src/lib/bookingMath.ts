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
  unit: "bed" | "room";
  maxOccupancy: number;
  pricing: { ghs: number; usd: number };
};

/** Must mirror convex/lib/agcConfig.ts AGC_ACCOMMODATION_TYPES. */
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
    unit: "room",
    maxOccupancy: 2,
    pricing: { ghs: 2500, usd: 210 },
  },
  good_general: {
    label: "Good General Lodge",
    unit: "room",
    maxOccupancy: 2,
    pricing: { ghs: 5000, usd: 420 },
  },
  ebpv: {
    label: "EBPV Apartment",
    unit: "room",
    maxOccupancy: 2,
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

/** Unit price for one bed/room, mirroring `accommodationPrice`. */
export function unitPrice(
  type: AgcAccommodationType,
  region: AgcRegion,
  isBishopRate = false,
): number {
  const ghs = isGhsRegion(region);
  const config = AGC_ACCOMMODATION_TYPES[type];
  if (isBishopRate && type === "ebpv") {
    return ghs ? AGC_BISHOP_RATE.ghs : AGC_BISHOP_RATE.usd;
  }
  return ghs ? config.pricing.ghs : config.pricing.usd;
}

/**
 * Group guests into priced lines exactly like the server does, so the form's
 * live summary equals what `createBooking` will compute and charge.
 */
export function computeBookingSummary(
  guests: Array<Pick<GuestDraft, "accommodationType" | "isBishopRate">>,
  region: AgcRegion,
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
    const config = AGC_ACCOMMODATION_TYPES[accommodationType];
    const units =
      config.unit === "bed"
        ? guestsInGroup
        : Math.ceil(guestsInGroup / config.maxOccupancy);
    const price = unitPrice(accommodationType, region, isBishopRate);
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

/** Capacity problem for the computed lines, or null when everything fits. */
export function capacityProblem(
  summary: BookingSummary,
  availability: Array<{ accommodationType: string; available: number }>,
): string | null {
  for (const line of summary.lines) {
    const row = availability.find((a) => a.accommodationType === line.accommodationType);
    if (row && row.available < line.units) {
      const config = AGC_ACCOMMODATION_TYPES[line.accommodationType];
      return `Only ${row.available} ${row.available === 1 ? config.unit : config.unit + "s"} left in ${config.label}, but the booking needs ${line.units}.`;
    }
  }
  return null;
}

/** Human summary like "2 dorm beds · 1 EBPV room". */
export function describeUnits(summary: BookingSummary): string {
  return summary.lines
    .map(
      (line) =>
        `${line.units} ${line.unitLabel}${line.units === 1 ? "" : "s"}`,
    )
    .join(" · ");
}
