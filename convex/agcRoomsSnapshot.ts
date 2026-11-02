import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole } from "./users";
import { buildActiveHubs } from "./agcAdminData";
import {
  buildDeletedRooms,
  buildRoomingOverview,
  buildRoomingSettings,
  buildRoomsAdmin,
  buildUnassignedGuests,
} from "./agcRoomAssignments";
import { buildRoomIssues } from "./agcRoomIssues";

/** The room team — the same people the individual room queries admit. */
const ROOM_SNAPSHOT_ROLES = ["admin", "accommodation", "room_assignment"] as const;

/**
 * The rooms screen in one call.
 *
 * The grid, the unassigned roster, the rooming numbers, the rooming switches,
 * the deleted-rooms bin, the fault history and the hub list were seven live
 * subscriptions that each scanned `agcRooms`, `agcGuests`, `agcBookings` and
 * `agcRoomAssignments`. Any assignment, room edit, hold or fault therefore
 * re-ran all seven. This reads those tables once per invalidation instead, and
 * the screen keeps every row and number it showed before.
 */
export const getRoomsSnapshot = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_SNAPSHOT_ROLES]);
    const [rooms, unassigned, settings, rooming, deletedRooms, issues, hubs] =
      await Promise.all([
        buildRoomsAdmin(ctx),
        buildUnassignedGuests(ctx),
        buildRoomingSettings(ctx),
        buildRoomingOverview(ctx),
        buildDeletedRooms(ctx),
        // The rooms screen shows fixed faults too: a room repaired three times
        // is a different proposition from one with a single old repair.
        buildRoomIssues(ctx, true),
        buildActiveHubs(ctx),
      ]);
    return { rooms, unassigned, settings, rooming, deletedRooms, issues, hubs };
  },
});
