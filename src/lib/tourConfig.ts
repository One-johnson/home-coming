import {
  REGION_CONFIG,
  type PaymentGateway,
  type RegistrationRegion,
} from "@/lib/registrationConfig";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Display view of a tour package. The public page feeds this from the
 * repo-hosted manifest (id = slug, no Convex query); the checkout resolves
 * real Convex rows by slug when the order is placed.
 */
export type TourPackageView = {
  _id: string;
  slug: string;
  label: string;
  dateLabel: string;
  timeRange: string;
  sites: string[];
  meals: string;
  priceUsd: number;
  priceGhs?: number;
  imageUrl?: string;
  displayImageUrl?: string;
  badge?: string;
};

/** The manifest-backed shape — identical fields, no Convex types. */
export type TourPackageDisplay = TourPackageView;

export type TourPackageSelection = {
  packageId: Id<"tourPackages">;
  quantity: number;
};

export const TOUR_CURRENCY = "USD" as const;
export const TOUR_CURRENCY_SYMBOL = "$";
export const FALLBACK_TOUR_IMAGE = "/campus/campus.jpg";

/** Default cover images by package slug (used when DB imageUrl is empty). */
export const DEFAULT_TOUR_IMAGES_BY_SLUG: Record<string, string> = {
  accra_mon_nov_1: "/gallery/2025/homecoming-02.jpg",
  mountain_thu_nov_4: "/gallery/2025/homecoming-08.jpg",
};

export function resolveTourImage(pkg: {
  slug?: string;
  imageUrl?: string | null;
  displayImageUrl?: string | null;
}) {
  const fromDisplay = pkg.displayImageUrl?.trim();
  if (fromDisplay) return fromDisplay;
  const fromDb = pkg.imageUrl?.trim();
  if (fromDb) return fromDb;
  if (pkg.slug && DEFAULT_TOUR_IMAGES_BY_SLUG[pkg.slug]) {
    return DEFAULT_TOUR_IMAGES_BY_SLUG[pkg.slug];
  }
  return FALLBACK_TOUR_IMAGE;
}

export const LIBRARY_OF_THE_ANOINTED_NOTE =
  "These packages do not include the Library of the Anointed. Tours for the Library of the Anointed are held on site and can be paid for on campus at Anagkazo.";

export function calculateTourTotal(
  packages: TourPackageView[],
  quantities: Record<string, number>,
  region: RegistrationRegion,
) {
  const packageById = new Map(packages.map((pkg) => [pkg._id, pkg]));
  const lineItems: {
    packageId: string;
    label: string;
    dateLabel: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[] = [];

  for (const [packageId, quantity] of Object.entries(quantities)) {
    const qty = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
    if (qty < 1) continue;
    const pkg = packageById.get(packageId);
    if (!pkg) continue;
    lineItems.push({
      packageId: pkg._id,
      label: pkg.label,
      dateLabel: pkg.dateLabel,
      quantity: qty,
      unitPrice: pkg.priceUsd,
      lineTotal: pkg.priceUsd * qty,
    });
  }

  const grandTotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const gateway: PaymentGateway = REGION_CONFIG[region].gateway;

  return {
    lineItems,
    grandTotal,
    currency: TOUR_CURRENCY,
    currencySymbol: TOUR_CURRENCY_SYMBOL,
    gateway,
    selections: lineItems.map((item) => ({
      packageSlug: item.packageId,
      quantity: item.quantity,
    })),
  };
}
