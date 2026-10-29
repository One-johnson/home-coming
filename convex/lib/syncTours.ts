import type { MutationCtx } from "../_generated/server";
import { DEFAULT_TOUR_PACKAGES } from "./tourConfig";

/**
 * Seed the default tours into a deployment that does not have them yet.
 *
 * Insert-only on purpose. This used to patch every known slug back to the
 * hardcoded defaults and delete every package whose slug was not on the list,
 * so a save in the admin Tours tab was reverted the next time that page
 * mounted, and a deleted tour came straight back. Once a package exists the
 * database is the source of truth — only `tourPackages.update` may change it,
 * and only `tourPackages.remove` may delete it.
 */
export async function syncTourPackagesToDefaults(ctx: MutationCtx) {
  const now = Date.now();
  const insertedSlugs: string[] = [];

  for (const pkg of DEFAULT_TOUR_PACKAGES) {
    const existing = await ctx.db
      .query("tourPackages")
      .withIndex("by_slug", (q) => q.eq("slug", pkg.slug))
      .first();

    if (existing) continue;

    await ctx.db.insert("tourPackages", {
      slug: pkg.slug,
      label: pkg.label,
      dateLabel: pkg.dateLabel,
      timeRange: pkg.timeRange,
      sites: pkg.sites,
      meals: pkg.meals,
      priceUsd: pkg.priceUsd,
      priceGhs: pkg.priceGhs,
      imageUrl: pkg.imageUrl,
      badge: pkg.badge,
      active: true,
      order: pkg.order,
      updatedAt: now,
    });
    insertedSlugs.push(pkg.slug);
  }

  return { inserted: insertedSlugs.length, insertedSlugs };
}
