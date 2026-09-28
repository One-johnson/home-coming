import rawTours from "../data/toursManifest.json";
import type { TourPackageDisplay } from "./tourConfig";

/**
 * Tour packages are repo-hosted in src/data/toursManifest.json (synced from
 * Convex via `npm run tours:sync`, verified on every build). The /tours page
 * renders from this manifest with zero Convex queries for package content.
 *
 * The manifest is DISPLAY-ONLY: `tourOrders.create` resolves packages by
 * slug from the database and re-prices server-side, so checkout cannot be
 * manipulated through the manifest.
 *
 * `verified at build time by scripts/tours-manifest.mjs check`
 */

export type ManifestTourPackage = {
  slug: string;
  label: string;
  dateLabel: string;
  timeRange: string;
  sites: string[];
  meals: string;
  priceUsd: number;
  priceGhs?: number;
  image?: string;
  badge?: string;
  order: number;
};

export const toursManifest: ManifestTourPackage[] = (
  rawTours as { packages: ManifestTourPackage[] }
).packages;

/** Active packages shaped for the cards/checkout, in manifest order. */
export function listTourPackages(): TourPackageDisplay[] {
  return toursManifest.map((pkg) => ({
    _id: pkg.slug,
    slug: pkg.slug,
    label: pkg.label,
    dateLabel: pkg.dateLabel,
    timeRange: pkg.timeRange,
    sites: pkg.sites,
    meals: pkg.meals,
    priceUsd: pkg.priceUsd,
    priceGhs: pkg.priceGhs,
    displayImageUrl: pkg.image,
    badge: pkg.badge,
  }));
}
