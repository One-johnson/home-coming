import type {
  AgcAccommodationType,
  AgcInventoryScope,
  AgcRegion,
} from "../schemaTypes";

// ------------------------------------------------------------------
// Registration pricing by region (SRS §11)
// ------------------------------------------------------------------

export type RegionPricing = {
  label: string;
  price: number;
  currency: string;
  /**
   * Legacy Stripe-era flag. Every region now pays offline (bank / MoMo with
   * receipt verification); kept only so historical DB rows still validate.
   */
  online: boolean;
};

export const AGC_REGIONS: Record<AgcRegion, RegionPricing> = {
  ghana: { label: "Ghana", price: 30, currency: "GHS", online: false },
  west_africa: {
    label: "West Africa (outside Ghana)",
    price: 30,
    currency: "GHS",
    online: false,
  },
  rest_of_africa: {
    label: "Rest of Africa",
    price: 10,
    currency: "USD",
    online: false,
  },
  north_america: {
    label: "North America",
    price: 20,
    currency: "USD",
    online: false,
  },
  england: { label: "England", price: 20, currency: "GBP", online: false },
  switzerland: {
    label: "Switzerland",
    price: 20,
    currency: "CHF",
    online: false,
  },
  rest_of_europe: {
    label: "Rest of Europe",
    price: 20,
    currency: "EUR",
    online: false,
  },
  rest_of_world: {
    label: "Rest of World",
    price: 20,
    currency: "USD",
    online: false,
  },
};

export const AGC_REGION_KEYS = Object.keys(AGC_REGIONS) as AgcRegion[];

export function regionPricing(region: AgcRegion): RegionPricing {
  return AGC_REGIONS[region] ?? AGC_REGIONS.rest_of_world;
}

// ------------------------------------------------------------------
// Accommodation types (SRS §23–26)
// ------------------------------------------------------------------

export type AccommodationTypeConfig = {
  label: string;
  /** Units consumed — every type is priced per bed (1 bed per guest). */
  unit: "bed";
  maxOccupancy: number;
  /** Region-scoped bed pools or one global pool. */
  poolScope: "regional" | "global";
  pricing: {
    ghs: number;
    usd: number;
  };
};

export const AGC_ACCOMMODATION_TYPES: Record<
  AgcAccommodationType,
  AccommodationTypeConfig
> = {
  dormitory: {
    label: "Dormitory (Mighty Fortress)",
    unit: "bed",
    maxOccupancy: 1,
    poolScope: "regional",
    pricing: { ghs: 150, usd: 15 },
  },
  hostel: {
    label: "Hostel (Blocks 1–8)",
    unit: "bed",
    maxOccupancy: 1,
    poolScope: "regional",
    pricing: { ghs: 450, usd: 40 },
  },
  wise_serpents: {
    label: "Wise as Serpents Lodge",
    unit: "bed",
    maxOccupancy: 1,
    poolScope: "global",
    pricing: { ghs: 2500, usd: 210 },
  },
  good_general: {
    label: "Good General Lodge",
    unit: "bed",
    maxOccupancy: 1,
    poolScope: "global",
    pricing: { ghs: 5000, usd: 420 },
  },
  ebpv: {
    label: "EBPV Apartment",
    unit: "bed",
    maxOccupancy: 1,
    poolScope: "global",
    pricing: { ghs: 6200, usd: 520 },
  },
};

export const AGC_ACCOMMODATION_TYPE_KEYS = Object.keys(
  AGC_ACCOMMODATION_TYPES,
) as AgcAccommodationType[];

/** Default EBPV Bishop Special Rate per bed (SRS §27) — admin-editable at runtime. */
export const AGC_BISHOP_RATE = { ghs: 1500, usd: 140 } as const;

// ------------------------------------------------------------------
// Inventory pool defaults (SRS §23, §28)
// ------------------------------------------------------------------

export type PoolSeed = {
  accommodationType: AgcAccommodationType;
  scope: AgcInventoryScope;
  total: number;
};

export const AGC_INVENTORY_SEED: PoolSeed[] = [
  { accommodationType: "dormitory", scope: "africa", total: 1000 },
  { accommodationType: "dormitory", scope: "rest_of_world", total: 1500 },
  { accommodationType: "hostel", scope: "africa", total: 700 },
  { accommodationType: "hostel", scope: "rest_of_world", total: 700 },
  { accommodationType: "wise_serpents", scope: "global", total: 30 },
  { accommodationType: "good_general", scope: "global", total: 35 },
  { accommodationType: "ebpv", scope: "global", total: 35 },
];

/** Region → which regional pool it draws from. */
export function scopeForRegion(
  region: AgcRegion,
): AgcInventoryScope {
  if (
    region === "ghana" ||
    region === "west_africa" ||
    region === "rest_of_africa"
  ) {
    return "africa";
  }
  return "rest_of_world";
}

// ------------------------------------------------------------------
// Deadlines and settings keys (SRS §14, §32–34, §55)
// ------------------------------------------------------------------

export const AGC_DEFAULTS = {
  /** Registration & accommodation deadline. */
  deadline: "2026-10-13T23:59:59.000Z",
  /** Offline hold window in hours. */
  holdHours: 72,
} as const;

export const AGC_SETTING_KEYS = {
  deadline: "deadline",
  holdHours: "hold_hours",
  registrationBank: "registration_bank_details",
  accommodationBank: "accommodation_bank_details",
  titles: "guest_titles",
  /** "true" blocks all new registrations AND accommodation bookings. */
  lockdown: "registration_lockdown",
  /** JSON: { [type]: { ghs, usd } } — per-bed prices, admin-editable. */
  accommodationPrices: "accommodation_prices",
  /** JSON: { [type]: string } — display labels, admin-editable. */
  accommodationLabels: "accommodation_labels",
  /** JSON: { ghs, usd } — EBPV Bishop special rate, admin-editable. */
  bishopRate: "bishop_rate",
  /** JSON: { [type|scope]: number } — inventory pool totals, admin-editable. */
  poolTotals: "pool_totals",
} as const;

/** All setting keys accepted by setAgcSetting (type-safe union of values). */
export const AGC_SETTING_KEY_LIST = Object.values(AGC_SETTING_KEYS) as readonly (
  | (typeof AGC_SETTING_KEYS)[keyof typeof AGC_SETTING_KEYS]
)[];

export const AGC_DEFAULT_TITLES = ["Bishop", "Member"] as const;

/**
 * Offline (GHS) payment accounts, shown to reps on the registration and
 * accommodation forms. Editable at runtime via the agcSettings table —
 * these are the seed/self-heal defaults.
 */
export const AGC_DEFAULT_BANK_DETAILS = {
  registration: [
    "Registration Payments",
    "Bank: Ecobank",
    "Account Name: Lighthouse Chapel International",
    "Branch: Tema Mall Branch",
    "Account Number: 1441001359380",
    "SWIFT Code: ECOCGHAC",
  ].join("\n"),
  accommodation: [
    "Accommodation Payments",
    "Bank: Ecobank",
    "Account Name: Lighthouse Chapel International",
    "Branch: Madina Branch",
    "Account Number: 1441005099169",
    "SWIFT Code: ECOCGHAC",
  ].join("\n"),
} as const;
