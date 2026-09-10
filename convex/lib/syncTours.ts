import type { MutationCtx } from "../_generated/server";
import { DEFAULT_TOUR_PACKAGES } from "./tourConfig";

export async function syncTourPackagesToDefaults(ctx: MutationCtx) {
  const now = Date.now();
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  const keepSlugs = new Set(DEFAULT_TOUR_PACKAGES.map((pkg) => pkg.slug));

  for (const pkg of DEFAULT_TOUR_PACKAGES) {
    const existing = await ctx.db
      .query("tourPackages")
      .withIndex("by_slug", (q) => q.eq("slug", pkg.slug))
      .first();

    const fields = {
      label: pkg.label,
      dateLabel: pkg.dateLabel,
      timeRange: pkg.timeRange,
      sites: pkg.sites,
      meals: pkg.meals,
      priceUsd: pkg.priceUsd,
      priceGhs: pkg.priceGhs,
      badge: pkg.badge,
      active: true,
      order: pkg.order,
      updatedAt: now,
    };

    if (!existing) {
      await ctx.db.insert("tourPackages", {
        slug: pkg.slug,
        imageUrl: pkg.imageUrl,
        ...fields,
      });
      inserted += 1;
      continue;
    }

    await ctx.db.patch(existing._id, {
      ...fields,
      imageUrl:
        existing.imageUrl || existing.imageStorageId
          ? existing.imageUrl
          : pkg.imageUrl,
    });
    updated += 1;
  }

  const allPackages = await ctx.db.query("tourPackages").collect();
  for (const pkg of allPackages) {
    if (keepSlugs.has(pkg.slug)) continue;
    if (pkg.imageStorageId) {
      await ctx.storage.delete(pkg.imageStorageId);
    }
    await ctx.db.delete(pkg._id);
    deleted += 1;
  }

  return { inserted, updated, deleted };
}
