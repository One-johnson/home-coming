import type { MutationCtx } from "../_generated/server";
import { HOTELS, hotelDocumentFields } from "./hotelConfig";

export async function syncHotelsToDefaults(ctx: MutationCtx) {
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  const keepNames = new Set(HOTELS.map((hotel) => hotel.name.toLowerCase()));
  const existing = await ctx.db.query("hotels").collect();
  const byName = new Map(
    existing.map((hotel) => [hotel.name.toLowerCase(), hotel] as const),
  );

  for (const hotel of HOTELS) {
    const fields = hotelDocumentFields(hotel);
    const current = byName.get(hotel.name.toLowerCase());

    if (!current) {
      await ctx.db.insert("hotels", fields);
      inserted += 1;
      continue;
    }

    await ctx.db.patch(current._id, {
      ...fields,
      discountCode: current.discountCode,
    });
    updated += 1;
    byName.delete(hotel.name.toLowerCase());
  }

  for (const hotel of existing) {
    if (keepNames.has(hotel.name.toLowerCase())) continue;
    await ctx.db.delete(hotel._id);
    deleted += 1;
  }

  return { inserted, updated, deleted, total: HOTELS.length };
}
