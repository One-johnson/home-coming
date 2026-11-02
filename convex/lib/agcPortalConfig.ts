import type { QueryCtx } from "../_generated/server";
import { AGC_DEFAULTS, AGC_REGIONS, AGC_SETTING_KEYS } from "./agcConfig";

/**
 * Public portal config (pricing, deadline, bank details).
 *
 * Screens that already load a rep-scoped payload fold this into that call, so a
 * portal tab holds one settings read instead of a separate `getPortalConfig`
 * subscription that re-runs on every settings write.
 */
export async function buildPortalConfig(ctx: QueryCtx) {
  const settings = await ctx.db.query("agcSettings").collect();
  const map = new Map(settings.map((row) => [row.key, row.value]));
  return {
    deadline: map.get(AGC_SETTING_KEYS.deadline) ?? AGC_DEFAULTS.deadline,
    locked: map.get(AGC_SETTING_KEYS.lockdown) === "true",
    registrationBankDetails:
      map.get(AGC_SETTING_KEYS.registrationBank) ?? "",
    accommodationBankDetails:
      map.get(AGC_SETTING_KEYS.accommodationBank) ?? "",
    regions: Object.entries(AGC_REGIONS).map(([key, value]) => ({
      region: key,
      ...value,
    })),
  };
}
