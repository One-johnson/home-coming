import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Whether a hub has been granted the "payment on arrival" feature by an
 * admin (a row in agcPoaHubs). Enforced server-side on every POA mutation —
 * removing the grant immediately blocks new POA registrations/bookings.
 */
export async function isHubPoaEnabled(
  ctx: QueryCtx,
  hubId: Id<"agcHubs">,
): Promise<boolean> {
  const rows = await ctx.db
    .query("agcPoaHubs")
    .withIndex("by_hub", (q) => q.eq("hubId", hubId))
    .collect();
  return rows.length > 0;
}
