import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Running desk totals (`agcDeskStats`). Every desk shows site-wide tiles —
 * checked in, checked out, overrides, keys out and back — and counting them
 * meant reading every live check-in and every key on every desk after every
 * arrival. The counts are now kept by the writes themselves.
 *
 * Every write to `agcCheckIns` or `agcKeys` must go through the helpers below
 * (`insertCheckIn`, `patchCheckIn`, `deleteCheckIn`, `insertKey`, `patchKey`).
 * Each reads the row before and after, and adds the difference to the shard of
 * the room's building, so the totals stay exact whatever the write changed.
 * `recountDeskStats` rebuilds every shard from the rows themselves.
 */

export type DeskCounts = {
  checkedIn: number;
  checkedOut: number;
  paymentOverrides: number;
  keysIssued: number;
  keysReturned: number;
  byType: Record<string, { checkedIn: number; checkedOut: number }>;
};

/** Marks that the shards were built from the real rows at least once. */
export const SEEDED_SHARD = "__seeded";

export function emptyCounts(): DeskCounts {
  return {
    checkedIn: 0,
    checkedOut: 0,
    paymentOverrides: 0,
    keysIssued: 0,
    keysReturned: 0,
    byType: {},
  };
}

function addInto(target: DeskCounts, source: DeskCounts, sign: 1 | -1) {
  target.checkedIn += sign * source.checkedIn;
  target.checkedOut += sign * source.checkedOut;
  target.paymentOverrides += sign * source.paymentOverrides;
  target.keysIssued += sign * source.keysIssued;
  target.keysReturned += sign * source.keysReturned;
  for (const [type, entry] of Object.entries(source.byType)) {
    const current = target.byType[type] ?? { checkedIn: 0, checkedOut: 0 };
    current.checkedIn += sign * entry.checkedIn;
    current.checkedOut += sign * entry.checkedOut;
    target.byType[type] = current;
  }
}

/** The shard a room's rows count under: its building, or "" for none. */
function shardFor(building: string | undefined | null): string {
  return building ?? "";
}

/**
 * What one check-in row adds to the totals: only live rows count, the same
 * rows the desk read through `by_live` (a corrected row is never live).
 */
export function checkInCounts(
  checkIn: Doc<"agcCheckIns"> | null,
  roomType: string | undefined,
): DeskCounts {
  const counts = emptyCounts();
  if (!checkIn || checkIn.live !== true || checkIn.correctedAt) return counts;
  const out = !!checkIn.checkedOutAt;
  if (out) counts.checkedOut = 1;
  else counts.checkedIn = 1;
  if (checkIn.paymentOverride) counts.paymentOverrides = 1;
  if (roomType) {
    counts.byType[roomType] = { checkedIn: out ? 0 : 1, checkedOut: out ? 1 : 0 };
  }
  return counts;
}

/** What one key row adds: out with a delegate, or back at the desk. */
export function keyCounts(key: Doc<"agcKeys"> | null): DeskCounts {
  const counts = emptyCounts();
  if (!key) return counts;
  if (key.status === "issued" || key.status === "replaced") counts.keysIssued = 1;
  if (key.status === "returned") counts.keysReturned = 1;
  return counts;
}

async function roomTypeOf(
  ctx: QueryCtx,
  checkIn: Doc<"agcCheckIns">,
): Promise<string | undefined> {
  if (checkIn.roomType) return checkIn.roomType;
  return (await ctx.db.get(checkIn.roomId))?.accommodationType;
}

async function applyDelta(
  ctx: MutationCtx,
  shard: string,
  before: DeskCounts,
  after: DeskCounts,
) {
  const delta = emptyCounts();
  addInto(delta, after, 1);
  addInto(delta, before, -1);
  const unchanged =
    delta.checkedIn === 0 &&
    delta.checkedOut === 0 &&
    delta.paymentOverrides === 0 &&
    delta.keysIssued === 0 &&
    delta.keysReturned === 0 &&
    Object.values(delta.byType).every(
      (entry) => entry.checkedIn === 0 && entry.checkedOut === 0,
    );
  if (unchanged) return;
  const row = await ctx.db
    .query("agcDeskStats")
    .withIndex("by_shard", (q) => q.eq("shard", shard))
    .unique();
  if (!row) {
    await ctx.db.insert("agcDeskStats", { shard, ...delta, updatedAt: Date.now() });
    return;
  }
  const next: DeskCounts = {
    checkedIn: row.checkedIn,
    checkedOut: row.checkedOut,
    paymentOverrides: row.paymentOverrides,
    keysIssued: row.keysIssued,
    keysReturned: row.keysReturned,
    byType: { ...row.byType },
  };
  addInto(next, delta, 1);
  await ctx.db.patch(row._id, { ...next, updatedAt: Date.now() });
}

async function recordCheckIn(
  ctx: MutationCtx,
  before: Doc<"agcCheckIns"> | null,
  after: Doc<"agcCheckIns"> | null,
) {
  const subject = after ?? before;
  if (!subject) return;
  await applyDelta(
    ctx,
    shardFor(subject.building),
    checkInCounts(before, before ? await roomTypeOf(ctx, before) : undefined),
    checkInCounts(after, after ? await roomTypeOf(ctx, after) : undefined),
  );
}

async function recordKey(
  ctx: MutationCtx,
  before: Doc<"agcKeys"> | null,
  after: Doc<"agcKeys"> | null,
) {
  const subject = after ?? before;
  if (!subject) return;
  const room = await ctx.db.get(subject.roomId);
  await applyDelta(ctx, shardFor(room?.building), keyCounts(before), keyCounts(after));
}

export async function insertCheckIn(
  ctx: MutationCtx,
  doc: WithoutSystemFields<Doc<"agcCheckIns">>,
): Promise<Id<"agcCheckIns">> {
  const id = await ctx.db.insert("agcCheckIns", doc);
  await recordCheckIn(ctx, null, await ctx.db.get(id));
  return id;
}

export async function patchCheckIn(
  ctx: MutationCtx,
  id: Id<"agcCheckIns">,
  fields: Partial<WithoutSystemFields<Doc<"agcCheckIns">>>,
) {
  const before = await ctx.db.get(id);
  await ctx.db.patch(id, fields);
  await recordCheckIn(ctx, before, await ctx.db.get(id));
}

export async function deleteCheckIn(ctx: MutationCtx, id: Id<"agcCheckIns">) {
  const before = await ctx.db.get(id);
  await ctx.db.delete(id);
  await recordCheckIn(ctx, before, null);
}

export async function insertKey(
  ctx: MutationCtx,
  doc: WithoutSystemFields<Doc<"agcKeys">>,
): Promise<Id<"agcKeys">> {
  const id = await ctx.db.insert("agcKeys", doc);
  await recordKey(ctx, null, await ctx.db.get(id));
  return id;
}

export async function patchKey(
  ctx: MutationCtx,
  id: Id<"agcKeys">,
  fields: Partial<WithoutSystemFields<Doc<"agcKeys">>>,
) {
  const before = await ctx.db.get(id);
  await ctx.db.patch(id, fields);
  await recordKey(ctx, before, await ctx.db.get(id));
}

/** Site-wide totals from the shards, or null until the first recount. */
export async function readDeskTotals(ctx: QueryCtx): Promise<DeskCounts | null> {
  const rows = await ctx.db.query("agcDeskStats").collect();
  if (!rows.some((row) => row.shard === SEEDED_SHARD)) return null;
  const totals = emptyCounts();
  for (const row of rows) {
    if (row.shard === SEEDED_SHARD) continue;
    addInto(totals, row, 1);
  }
  return totals;
}

/** Totals counted from the rows, the way the desk did before the shards. */
export async function countDeskTotals(ctx: QueryCtx): Promise<{
  totals: DeskCounts;
  byShard: Map<string, DeskCounts>;
}> {
  const [checkIns, keys, rooms] = await Promise.all([
    ctx.db
      .query("agcCheckIns")
      .withIndex("by_live", (q) => q.eq("live", true))
      .collect(),
    ctx.db.query("agcKeys").collect(),
    ctx.db.query("agcRooms").collect(),
  ]);
  const roomById = new Map(rooms.map((room) => [room._id, room] as const));
  const totals = emptyCounts();
  const byShard = new Map<string, DeskCounts>();
  const add = (shard: string, counts: DeskCounts) => {
    addInto(totals, counts, 1);
    const current = byShard.get(shard) ?? emptyCounts();
    addInto(current, counts, 1);
    byShard.set(shard, current);
  };
  for (const checkIn of checkIns) {
    const type = checkIn.roomType ?? roomById.get(checkIn.roomId)?.accommodationType;
    add(shardFor(checkIn.building), checkInCounts(checkIn, type));
  }
  for (const key of keys) {
    add(shardFor(roomById.get(key.roomId)?.building), keyCounts(key));
  }
  return { totals, byShard };
}

/** Replaces every shard with counts taken from the rows, in one transaction. */
export async function recountDeskStats(ctx: MutationCtx) {
  const { totals, byShard } = await countDeskTotals(ctx);
  const existing = await ctx.db.query("agcDeskStats").collect();
  await Promise.all(existing.map((row) => ctx.db.delete(row._id)));
  const now = Date.now();
  for (const [shard, counts] of byShard) {
    await ctx.db.insert("agcDeskStats", { shard, ...counts, updatedAt: now });
  }
  await ctx.db.insert("agcDeskStats", {
    shard: SEEDED_SHARD,
    ...emptyCounts(),
    updatedAt: now,
  });
  return totals;
}
