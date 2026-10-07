export type AgcRegion =
  | "ghana"
  | "west_africa"
  | "rest_of_africa"
  | "north_america"
  | "england"
  | "switzerland"
  | "rest_of_europe"
  | "rest_of_world";

export type AgcAccommodationType =
  | "dormitory"
  | "hostel"
  | "wise_serpents"
  | "good_general"
  | "ebpv";

export const AGC_REGION_LABELS: Record<AgcRegion, string> = {
  ghana: "Ghana",
  west_africa: "West Africa (outside Ghana)",
  rest_of_africa: "Rest of Africa",
  north_america: "North America",
  england: "England",
  switzerland: "Switzerland",
  rest_of_europe: "Rest of Europe",
  rest_of_world: "Rest of World",
};

/** GHS hubs pay offline via bank transfer / MoMo (SRS §11). */
export function isGhsRegion(region: string): boolean {
  return region === "ghana" || region === "west_africa";
}

export const AGC_ACCOMMODATION_LABELS: Record<AgcAccommodationType, string> = {
  dormitory: "Dormitory (Mighty Fortress)",
  hostel: "Hostel (Blocks 1–8)",
  wise_serpents: "Wise as Serpents Lodge",
  good_general: "Good General Lodge",
  ebpv: "EBPV Apartment",
};

export function paymentStatusMeta(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        className:
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      };
    case "pending_verification":
      return {
        label: "Under review",
        className:
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
      };
    case "correction_requested":
      return {
        label: "Correction requested",
        className:
          "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
      };
    case "rejected":
      return {
        label: "Rejected",
        className: "border-destructive/30 bg-destructive/10 text-destructive",
      };
    default:
      return {
        label: "Awaiting payment",
        className: "border-border bg-muted text-muted-foreground",
      };
  }
}

export function bookingStatusMeta(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        className:
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      };
    case "reserved":
      return {
        label: "Reserved (hold)",
        className:
          "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
      };
    case "pending_verification":
      return {
        label: "Under review",
        className:
          "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
      };
    case "correction_requested":
      return {
        label: "Correction requested",
        className:
          "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
      };
    case "expired":
      return {
        label: "Expired",
        className: "border-border bg-muted text-muted-foreground",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        className: "border-border bg-muted text-muted-foreground",
      };
    default:
      return {
        label: status,
        className: "border-border bg-muted text-muted-foreground",
      };
  }
}

/**
 * Money is held per currency — cedis and dollars are never summed, so every
 * finance surface renders one line per currency code (GHS first, then USD,
 * then anything unexpected in stable order).
 */
export function byCurrencyDesc(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "GHS") return -1;
  if (b === "GHS") return 1;
  return a.localeCompare(b);
}

export type CurrencyFilter = "ALL" | "GHS" | "USD";

/** Currency focus toggles show a friendly "All" and fall back to the code. */
export function currencyFilterLabel(currency: CurrencyFilter): string {
  return currency === "ALL"
    ? "All currencies"
    : currency === "GHS"
      ? "Cedis (GHS)"
      : "Dollars (USD)";
}

/** True when a row's currency matches the current finance currency filter. */
export function matchesCurrencyFilter(
  currency: string,
  filter: CurrencyFilter,
): boolean {
  return filter === "ALL" || currency === filter;
}

/** "GHS 12,500 · USD 3,400" (or "—" when there is nothing to show). */
export function formatMoneyByCurrency(
  byCurrency: Record<string, number>,
): string {
  return (
    Object.keys(byCurrency)
      .sort(byCurrencyDesc)
      .map((currency) => `${currency} ${byCurrency[currency].toLocaleString()}`)
      .join(" · ") || "—"
  );
}

/**
 * Awaiting-review ageing buckets — shared by the finance overview tiles and
 * the finance tables so a bucket always means the same age span everywhere.
 * Mirrors the server-side bucketize() in getAgcOverview: full-day floors,
 * so a 7-day-old payment still sits in "3–7 days".
 */
export type AgeingBucketKey = "0-2" | "3-7" | "7plus";

export const AGEING_BUCKET_KEYS: AgeingBucketKey[] = [
  "0-2",
  "3-7",
  "7plus",
];

export const AGEING_BUCKET_LABELS: Record<AgeingBucketKey, string> = {
  "0-2": "0–2 days",
  "3-7": "3–7 days",
  "7plus": "7+ days",
};

export function isAgeingBucketKey(value: string): value is AgeingBucketKey {
  return (AGEING_BUCKET_KEYS as string[]).includes(value);
}

export function ageingBucketKey(
  createdAt: number,
  now: number = Date.now(),
): AgeingBucketKey {
  const ageDays = Math.floor((now - createdAt) / 86_400_000);
  if (ageDays <= 2) return "0-2";
  if (ageDays <= 7) return "3-7";
  return "7plus";
}

/** Badge tone per bucket — fresh is calm, 7+ days shouts. */
export function ageingBadgeClass(key: AgeingBucketKey): string {
  switch (key) {
    case "0-2":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "3-7":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "7plus":
      return "border-rose-200 bg-rose-50 text-rose-800";
  }
}
