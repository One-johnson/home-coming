import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import type {
  ArrivalDeskRow,
  ArrivalKeyState,
  ArrivalOverview,
} from "@convex/agcCheckin";

export type ArrivalDeskBase = FunctionReturnType<
  typeof api.agcCheckin.getArrivalDeskBase
>;
export type ArrivalDeskState = FunctionReturnType<
  typeof api.agcCheckin.getArrivalDeskState
>;
export type ArrivalDeskSite = FunctionReturnType<
  typeof api.agcCheckin.getArrivalDeskSite
>;

/** Same cap as the server's `DESK_STATE_ID_LIMIT`. */
const DESK_STATE_ID_LIMIT = 3_000;

/**
 * What a desk asks `getArrivalDeskState` for: its own delegates and its
 * building's rooms, or the whole site (no ids) for the central desk or a
 * building too large to ask for by id.
 */
export function deskStateScope(base: ArrivalDeskBase | undefined): {
  guestIds?: string[];
  roomIds?: string[];
} | null {
  if (!base) return null;
  if (!base.deskRoomIds) return {};
  const guestIds = base.rows.map((row) => row.guestId);
  if (guestIds.length + base.deskRoomIds.length > DESK_STATE_ID_LIMIT) return {};
  return { guestIds, roomIds: base.deskRoomIds };
}

/** The sheet never carried more than this many delegates. */
const SHEET_LIMIT = 400;

/**
 * Joins the desk's three subscriptions into the snapshot the page reads:
 *   - base: guests, rooms and assignments (rarely change during check-in);
 *   - state: check-ins and keys for this desk's own delegates and rooms;
 *   - site: the site-wide running totals, recent arrivals and review flags.
 * The result matches what `getArrivalSnapshot` built on the server.
 */
export function composeArrivalSnapshot(
  base: ArrivalDeskBase,
  state: ArrivalDeskState,
  site: ArrivalDeskSite,
  options: { includeCheckedOut?: boolean },
) {
  const checkInByGuest = new Map<string, ArrivalDeskState["checkIns"][number]>();
  for (const c of state.checkIns) checkInByGuest.set(c.guestId, c);
  const totals = site.totals;

  const rows: ArrivalDeskRow[] = [];
  for (const row of base.rows) {
    if (rows.length >= SHEET_LIMIT) break;
    const checkIn = checkInByGuest.get(row.guestId);
    if (checkIn?.checkedOutAt && !options.includeCheckedOut) continue;
    const keyStatus = row.roomId ? state.keyStatusByRoom[row.roomId] : undefined;
    const keyOpen = keyStatus !== undefined && keyStatus !== "returned";
    let keyState: ArrivalKeyState | null = null;
    if (row.needsKey) {
      keyState =
        keyStatus === undefined
          ? "pending"
          : keyStatus === "returned"
            ? "returned"
            : "issued";
    }
    rows.push({
      ...row,
      checkInStatus: checkIn
        ? checkIn.checkedOutAt
          ? "checked_out"
          : "checked_in"
        : "not_arrived",
      checkInId: checkIn?._id ?? null,
      checkedInAt: checkIn?.checkedInAt ?? null,
      pendingKeyRoom: row.needsKey && !keyOpen,
      keyStatus: keyState,
      reviewFlag: site.flagsByGuest[row.guestId] ?? null,
    });
  }

  const perType = new Map<string, ArrivalOverview["perLocation"][number]>();
  for (const entry of base.overview.capacityByType) {
    perType.set(entry.accommodationType, {
      ...entry,
      assigned: 0,
      checkedIn: 0,
      checkedOut: 0,
      available: 0,
      occupancyPercent: 0,
    });
  }
  for (const { type } of base.overview.assignmentTypes) {
    const entry = perType.get(type);
    if (entry) entry.assigned += 1;
  }
  // Arrivals per type come from the running totals, filed under the room
  // type the delegate was checked into.
  for (const [type, counts] of Object.entries(totals.byType)) {
    const entry = perType.get(type);
    if (!entry) continue;
    entry.checkedIn = Math.max(0, counts.checkedIn);
    entry.checkedOut = Math.max(0, counts.checkedOut);
  }
  for (const entry of perType.values()) {
    entry.available = Math.max(0, entry.capacity - entry.assigned);
    entry.occupancyPercent =
      entry.capacity > 0 ? Math.round((entry.assigned / entry.capacity) * 100) : 0;
  }

  const { assigned, unassigned } = base.overview;
  const checkedIn = Math.max(0, totals.checkedIn);
  const checkedOut = Math.max(0, totals.checkedOut);
  const overview: ArrivalOverview = {
    totalRoomable: base.overview.totalRoomable,
    assigned,
    unassigned,
    checkedIn,
    notArrived: Math.max(0, assigned - checkedIn),
    checkedOut,
    totalCapacity: base.overview.totalCapacity,
    remainingCapacity: base.overview.remainingCapacity,
    keysIssued: Math.max(0, totals.keysIssued),
    keysReturned: Math.max(0, totals.keysReturned),
    unresolvedExceptions: unassigned + site.offlineConflicts,
    paymentOverrides: Math.max(0, totals.paymentOverrides),
    offlineConflicts: site.offlineConflicts,
    reviewFlags: site.reviewFlags,
    perLocation: [...perType.values()].sort((a, b) =>
      a.typeLabel.localeCompare(b.typeLabel),
    ),
  };

  return {
    overview,
    recent: site.recent,
    keys: state.keys,
    rows,
    rooms: base.rooms,
    roomIssues: base.roomIssues,
  };
}
