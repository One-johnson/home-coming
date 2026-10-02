import type { QueryCtx } from "../_generated/server";
import {
  AGC_ACCOMMODATION_TYPES,
  AGC_BISHOP_RATE,
  AGC_SETTING_KEYS,
  type AccommodationTypeConfig,
} from "./agcConfig";
import type {
  AgcAccommodationType,
  AgcInventoryScope,
} from "../schemaTypes";

/**
 * Runtime-editable accommodation configuration. The static defaults in
 * agcConfig.ts are the fallback; admins override prices, labels, the EBPV
 * Bishop rate, and pool totals via the Settings page (agcSettings rows).
 * Every getter is read-only and self-healing: malformed or partial override
 * JSON falls back to the defaults field-by-field.
 */

export type AccommodationTypesConfig = Record<
  AgcAccommodationType,
  AccommodationTypeConfig
>;

export type BishopRate = { ghs: number; usd: number };

async function readSetting(ctx: QueryCtx, key: string): Promise<string | null> {
  const row = await ctx.db
    .query("agcSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row?.value ?? null;
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizePrice(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sanitizeLabel(value: unknown, fallback: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : fallback;
}

/**
 * The accommodation type catalog with admin overrides applied. Pricing is
 * per bed for every type (1 bed per guest). `unit`/`maxOccupancy`/`poolScope`
 * are structural and stay fixed; labels and GHS/USD prices are editable.
 */
export async function getAccommodationTypesConfig(
  ctx: QueryCtx,
): Promise<AccommodationTypesConfig> {
  const [pricesRaw, labelsRaw] = await Promise.all([
    readSetting(ctx, AGC_SETTING_KEYS.accommodationPrices),
    readSetting(ctx, AGC_SETTING_KEYS.accommodationLabels),
  ]);
  const priceOverrides = parseJsonObject(pricesRaw);
  const labelOverrides = parseJsonObject(labelsRaw);

  const result = {} as AccommodationTypesConfig;
  for (const [type, defaults] of Object.entries(AGC_ACCOMMODATION_TYPES) as [
    AgcAccommodationType,
    AccommodationTypeConfig,
  ][]) {
    const priceEntry = priceOverrides
      ? parseJsonObject(JSON.stringify(priceOverrides[type] ?? null))
      : null;
    const ghs = priceEntry
      ? sanitizePrice(priceEntry.ghs, defaults.pricing.ghs)
      : defaults.pricing.ghs;
    const usd = priceEntry
      ? sanitizePrice(priceEntry.usd, defaults.pricing.usd)
      : defaults.pricing.usd;
    result[type] = {
      ...defaults,
      label: labelOverrides
        ? sanitizeLabel(labelOverrides[type], defaults.label)
        : defaults.label,
      pricing: { ghs, usd },
    };
  }
  return result;
}

/** EBPV Bishop special rate with admin override (falls back to defaults). */
export async function getBishopRate(ctx: QueryCtx): Promise<BishopRate> {
  const raw = await readSetting(ctx, AGC_SETTING_KEYS.bishopRate);
  const parsed = parseJsonObject(raw);
  if (!parsed) return { ...AGC_BISHOP_RATE };
  return {
    ghs: sanitizePrice(parsed.ghs, AGC_BISHOP_RATE.ghs),
    usd: sanitizePrice(parsed.usd, AGC_BISHOP_RATE.usd),
  };
}

/**
 * Raw pool-total overrides keyed by `${type}|${scope}`. Structural only —
 * consumers decide how to apply them (lazy seed, admin edits, reallocation).
 */
export async function getPoolTotalOverrides(
  ctx: QueryCtx,
): Promise<Record<string, number>> {
  const raw = await readSetting(ctx, AGC_SETTING_KEYS.poolTotals);
  const parsed = parseJsonObject(raw);
  if (!parsed) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

export async function getPoolTotalOverride(
  ctx: QueryCtx,
  type: AgcAccommodationType,
  scope: AgcInventoryScope,
): Promise<number | null> {
  const overrides = await getPoolTotalOverrides(ctx);
  const value = overrides[`${type}|${scope}`];
  return value === undefined ? null : value;
}
