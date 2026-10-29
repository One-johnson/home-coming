import rawTours from "../data/toursManifest.json";
import {
  toTourPackageDisplay,
  type TourPackageDisplay,
} from "./tourConfig";

/**
 * FALLBACK tour content, not the source of truth.
 *
 * The /tours page subscribes to `tourPackages.listPublic` in Convex, so an
 * admin edit or deletion shows on the public page immediately with no
 * redeploy. This repo-hosted manifest only renders the first paint — before
 * the Convex query resolves, or when Convex is unreachable — so the page still
 * has real content and good SEO instead of a skeleton.
 *
 * `npm run tours:sync` refreshes it from the database, and `npm run build`
 * verifies every image path in it exists. Stale entries here are harmless:
 * checkout sends slugs and `tourOrders.create` re-prices from the database, so
 * nothing can be bought at a fallback price.
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
  startsAt?: number;
  departurePoint?: string;
  notIncluded?: string[];
};

export const toursManifest: ManifestTourPackage[] = (
  rawTours as { packages: ManifestTourPackage[] }
).packages;

/** Fallback packages shaped for the cards/checkout, in manifest order. */
export function listFallbackTourPackages(): TourPackageDisplay[] {
  return toursManifest.map((pkg) =>
    toTourPackageDisplay({ ...pkg, displayImageUrl: pkg.image }),
  );
}
