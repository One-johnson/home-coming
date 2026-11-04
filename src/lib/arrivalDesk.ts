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
export type ArrivalDeskLive = FunctionReturnType<
  typeof api.agcCheckin.getArrivalDeskLive
>;

/** The sheet never carried more than this many delegates. */
const SHEET_LIMIT = 400;

/**
 * Joins the desk's two subscriptions into the snapshot the page reads. The
 * base half (guests, rooms, assignments) rarely changes during check-in; the
 * live half (check-ins, keys, flags) does, and only it re-runs on a check-in.
 * The result matches what `getArrivalSnapshot` built on the server.
 */
export function composeArrivalSnapshot(
  base: ArrivalDeskBase,
  live: ArrivalDeskLive,
  options: { includeCheckedOut?: boolean },
) {
  const checkInByGuest = new Map<string, ArrivalDeskLive["checkIns"][number]>();
  const checkedInGuestIds = new Set<string>();
  const checkedOutGuestIds = new Set<string>();
  let checkedIn = 0;
  let checkedOut = 0;
  for (const c of live.checkIns) {
    checkInByGuest.set(c.guestId, c);
    if (c.checkedOutAt) {
      checkedOut += 1;
      checkedOutGuestIds.add(c.guestId);
    } else {
      checkedIn += 1;
      checkedInGuestIds.add(c.guestId);
    }
  }

  const rows: ArrivalDeskRow[] = [];
  for (const row of base.rows) {
    if (rows.length >= SHEET_LIMIT) break;
    const checkIn = checkInByGuest.get(row.guestId);
    if (checkIn?.checkedOutAt && !options.includeCheckedOut) continue;
    const keyStatus = row.roomId ? live.keyStatusByRoom[row.roomId] : undefined;
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
      reviewFlag: live.flagsByGuest[row.guestId] ?? null,
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
  for (const { guestId, type } of base.overview.assignmentTypes) {
    const entry = perType.get(type);
    if (!entry) continue;
    entry.assigned += 1;
    if (checkedInGuestIds.has(guestId)) entry.checkedIn += 1;
    if (checkedOutGuestIds.has(guestId)) entry.checkedOut += 1;
  }
  for (const entry of perType.values()) {
    entry.available = Math.max(0, entry.capacity - entry.assigned);
    entry.occupancyPercent =
      entry.capacity > 0 ? Math.round((entry.assigned / entry.capacity) * 100) : 0;
  }

  const { assigned, unassigned } = base.overview;
  const overview: ArrivalOverview = {
    totalRoomable: base.overview.totalRoomable,
    assigned,
    unassigned,
    checkedIn,
    notArrived: Math.max(0, assigned - checkedIn),
    checkedOut,
    totalCapacity: base.overview.totalCapacity,
    remainingCapacity: base.overview.remainingCapacity,
    keysIssued: live.keysIssued,
    keysReturned: live.keysReturned,
    unresolvedExceptions: unassigned + live.offlineConflicts,
    paymentOverrides: live.paymentOverrides,
    offlineConflicts: live.offlineConflicts,
    reviewFlags: live.reviewFlags,
    perLocation: [...perType.values()].sort((a, b) =>
      a.typeLabel.localeCompare(b.typeLabel),
    ),
  };

  return {
    overview,
    recent: live.recent,
    keys: live.keys,
    rows,
    rooms: base.rooms,
    roomIssues: base.roomIssues,
  };
}
