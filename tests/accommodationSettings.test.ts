import { expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { computeBookingLines } from "../convex/agcAccommodation";
import {
  getAccommodationTypesConfig,
  getBishopRate,
} from "../convex/lib/agcSettingsRuntime";
import { AGC_ACCOMMODATION_TYPES } from "../convex/lib/agcConfig";
import { createTestConvex } from "./testUtils";

/**
 * Admin-editable accommodation configuration: prices, labels, and the EBPV
 * Bishop rate live in agcSettings and merge over the static defaults.
 * The runtime getters must self-heal (malformed JSON → defaults) and the
 * booking math must apply overrides per bed.
 */

async function putSetting(t: ReturnType<typeof createTestConvex>, key: string, value: string) {
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("agcSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("agcSettings", { key, value, updatedAt: Date.now() });
    }
  });
}

test("price and label overrides merge over defaults", async () => {
  const t = createTestConvex();

  // Defaults first.
  const config = await t.run((ctx) => getAccommodationTypesConfig(ctx));
  expect(config.dormitory.pricing).toEqual({ ghs: 150, usd: 15 });
  expect(config.dormitory.label).toBe("Dormitory (Mighty Fortress)");

  // Admin overrides dormitory price + label.
  await putSetting(
    t,
    "accommodation_prices",
    JSON.stringify({ dormitory: { ghs: 200, usd: 25 } }),
  );
  await putSetting(
    t,
    "accommodation_labels",
    JSON.stringify({ dormitory: "Dorm (Renovated)" }),
  );

  const updated = await t.run((ctx) => getAccommodationTypesConfig(ctx));
  expect(updated.dormitory.pricing).toEqual({ ghs: 200, usd: 25 });
  expect(updated.dormitory.label).toBe("Dorm (Renovated)");
  // Untouched types keep defaults.
  expect(updated.hostel.pricing).toEqual({ ghs: 450, usd: 40 });
  // Structural fields never change.
  expect(updated.dormitory.unit).toBe("bed");
  expect(updated.dormitory.maxOccupancy).toBe(1);
});

test("malformed or partial override JSON falls back to defaults", async () => {
  const t = createTestConvex();
  await putSetting(t, "accommodation_prices", "{not json");
  await putSetting(t, "bishop_rate", JSON.stringify({ ghs: -5 }));

  const config = await t.run((ctx) => getAccommodationTypesConfig(ctx));
  expect(config.ebpv.pricing).toEqual(AGC_ACCOMMODATION_TYPES.ebpv.pricing);

  // Negative bishop value is rejected → default 140 USD / 1500 GHS.
  const bishop = await t.run((ctx) => getBishopRate(ctx));
  expect(bishop).toEqual({ ghs: 1500, usd: 140 });
});

test("bishop rate override applies", async () => {
  const t = createTestConvex();
  await putSetting(t, "bishop_rate", JSON.stringify({ ghs: 1200, usd: 100 }));
  const bishop = await t.run((ctx) => getBishopRate(ctx));
  expect(bishop).toEqual({ ghs: 1200, usd: 100 });
});

test("computeBookingLines prices per bed with overrides and bishop rate", () => {
  const types = {
    ...AGC_ACCOMMODATION_TYPES,
    dormitory: {
      ...AGC_ACCOMMODATION_TYPES.dormitory,
      pricing: { ghs: 200, usd: 25 },
    },
  };
  const bishop = { ghs: 1200, usd: 100 };

  const lines = computeBookingLines(
    [
      { firstName: "A", lastName: "B", gender: "male" as const, title: "Mr.", accommodationType: "dormitory", isBishopRate: false },
      { firstName: "C", lastName: "D", gender: "female" as const, title: "Ms.", accommodationType: "dormitory", isBishopRate: false },
      { firstName: "E", lastName: "F", gender: "male" as const, title: "Bishop", accommodationType: "ebpv", isBishopRate: true },
    ],
    "ghana",
    types,
    bishop,
  );

  // Two dormitory guests → one line of 2 beds at the overridden price.
  const dorm = lines.find((l) => l.accommodationType === "dormitory");
  expect(dorm).toMatchObject({ quantity: 2, unitPrice: 200, isBishopRate: false });
  // EBPV bishop → 1 bed at the overridden bishop rate.
  const ebpv = lines.find((l) => l.accommodationType === "ebpv");
  expect(ebpv).toMatchObject({ quantity: 1, unitPrice: 1200, isBishopRate: true });
});

test("getAgcSettings exposes live accommodation config + pools", async () => {
  const t = createTestConvex();
  await t.mutation(internal.agcAdminData.seedAgcDefaultsInternal, {});
  const settings = await t.query(api.agcAdminData.getAgcSettings, {});
  expect(settings.accommodationTypes).toHaveLength(5);
  expect(settings.accommodationTypes.every((row) => row.unit === "bed")).toBe(true);
  expect(settings.bishopRate).toEqual({ ghs: 1500, usd: 140 });
  expect(settings.pools.length).toBeGreaterThanOrEqual(7);
});
