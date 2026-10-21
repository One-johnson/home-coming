import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole } from "./users";
import { isRoomableBooking } from "./agcRoomAssignments";
import type { AgcAccommodationType } from "./schemaTypes";

/**
 * Pre-arrival readiness checklist (arrival day: November 2, 2026). One query
 * that answers "are we ready?" — inventory imported vs. confirmed pools,
 * publish coverage, EBPV apartment rules, and roomable-delegate assignment
 * coverage. Admin/accommodation/finance only (read-only).
 */

export const ARRIVAL_DATE = new Date("2026-11-02T00:00:00Z").getTime();

const TYPE_KEYS: AgcAccommodationType[] = [
  "dormitory",
  "hostel",
  "wise_serpents",
  "good_general",
  "ebpv",
];

export type PreArrivalItem = {
  key: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
  /** Where to fix the issue in the console, when relevant. */
  link?: string;
  linkLabel?: string;
};

export type PreArrivalReadiness = {
  daysUntilArrival: number;
  arrivalPassed: boolean;
  overallOk: boolean;
  items: PreArrivalItem[];
  perType: Array<{
    accommodationType: string;
    poolTotal: number;
    importedCapacity: number;
    importedRooms: number;
    published: number;
    assigned: number;
  }>;
};

export const getReadiness = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args): Promise<PreArrivalReadiness> => {
    await requireRole(ctx, args.sessionToken, [
      "admin",
      "accommodation",
      "finance",
    ]);

    const rooms = (await ctx.db.query("agcRooms").collect()).filter(
      (room) => !room.deletedAt,
    );
    const pools = await ctx.db.query("agcInventoryPools").collect();
    const poolTotalByType = new Map<string, number>();
    const poolExists = new Set<string>();
    for (const pool of pools) {
      poolTotalByType.set(
        pool.accommodationType,
        (poolTotalByType.get(pool.accommodationType) ?? 0) + pool.total,
      );
      poolExists.add(pool.accommodationType);
    }

    const openAssignments = (await ctx.db.query("agcRoomAssignments").collect())
      .filter((a) => a.endedAt === undefined);
    const assignedGuestIds = new Set(openAssignments.map((a) => a.guestId));
    const assignedByRoom = new Map<string, number>();
    for (const a of openAssignments) {
      assignedByRoom.set(a.roomId, (assignedByRoom.get(a.roomId) ?? 0) + 1);
    }

    const guests = (await ctx.db.query("agcGuests").collect()).filter(
      (g) => g.status === "active",
    );
    const bookings = await ctx.db.query("agcBookings").collect();
    const roomableBookingIds = new Set(
      bookings.filter(isRoomableBooking).map((b) => b._id),
    );
    const roomableGuests = guests.filter((g) =>
      roomableBookingIds.has(g.bookingId),
    );
    const unassigned = roomableGuests.filter(
      (g) => !assignedGuestIds.has(g._id),
    ).length;

    const now = Date.now();
    const daysUntilArrival = Math.max(
      0,
      Math.ceil((ARRIVAL_DATE - now) / 86_400_000),
    );

    const perType = TYPE_KEYS.map((type) => {
      const typeRooms = rooms.filter((r) => r.accommodationType === type);
      const importedCapacity = typeRooms.reduce((sum, r) => sum + r.capacity, 0);
      return {
        accommodationType: type,
        poolTotal: poolTotalByType.get(type) ?? 0,
        importedCapacity,
        importedRooms: typeRooms.length,
        published: typeRooms.filter((r) => r.publishedAt !== undefined).length,
        // Deployments never had assignments? Open assignments per room exist;
        // sum per type via room ids.
        assigned: typeRooms.reduce(
          (sum, r) => sum + (assignedByRoom.get(r._id) ?? 0),
          0,
        ),
      };
    });

    const items: PreArrivalItem[] = [];

    // 1. Inventory pools defined for every type (Phase 1 corrected §28).
    const missingPools = TYPE_KEYS.filter((t) => !poolExists.has(t));
    items.push({
      key: "pools",
      label: "Confirmed inventory pools",
      status: missingPools.length === 0 ? "ok" : "warn",
      detail:
        missingPools.length === 0
          ? `All 5 types pool-configured (import guard active).`
          : `No pool configured for: ${missingPools.join(", ")} — imports of those types will be refused`,
      link: "/admin/settings",
      linkLabel: "Settings",
    });

    // 2. Physical inventory imported to cover the pools (§3).
    const underPool = perType.filter(
      (t) => t.poolTotal > 0 && t.importedCapacity < t.poolTotal,
    );
    const nothingImported = perType.every((t) => t.importedRooms === 0);
    items.push({
      key: "import",
      label: "Physical room inventory imported",
      status:
        nothingImported
          ? "error"
          : underPool.length === 0
            ? "ok"
            : "warn",
      detail: nothingImported
        ? "No rooms imported yet — the desk cannot check anyone in without rooms"
        : underPool.length === 0
          ? `All types imported to pool level (${rooms.length} rooms, ${rooms.reduce((s, r) => s + r.capacity, 0)} spaces).`
          : underPool
              .map(
                (t) =>
                  `${t.accommodationType}: imported ${t.importedCapacity} of ${t.poolTotal} confirmed`,
              )
              .join(" · "),
      link: "/admin/accommodation",
      linkLabel: "Rooms",
    });

    // 3. EBPV apartments sane (§7): ≤4 delegates, mixed-gender.
    const badEbpv = rooms.filter(
      (room) =>
        room.accommodationType === "ebpv" &&
        ((room.capacity ?? 0) > 4 || room.gender),
    );
    items.push({
      key: "ebpv",
      label: "EBPV apartments (≤4 delegates, mixed-gender)",
      status: badEbpv.length === 0 ? "ok" : "error",
      detail:
        badEbpv.length === 0
          ? `${perType.find((t) => t.accommodationType === "ebpv")?.importedRooms ?? 0} apartment(s) conform`
          : `${badEbpv.length} apartment(s) break the rules: ${badEbpv.slice(0, 5).map((r) => r.name).join(", ")}`,
      link: "/admin/accommodation",
      linkLabel: "Rooms",
    });

    // 4. Publishing coverage (§8): rooms with occupants must be published;
    // total unpublished rooms shown for the full-block pass.
    const occupiedUnpublished = rooms.filter(
      (room) =>
        room.publishedAt === undefined &&
        (assignedByRoom.get(room._id) ?? 0) > 0,
    );
    const unpublished = rooms.filter(
      (room) => room.publishedAt === undefined,
    ).length;
    items.push({
      key: "publish",
      label: "Room publishing (what reps can see)",
      status: occupiedUnpublished.length === 0 ? "ok" : "warn",
      detail:
        occupiedUnpublished.length === 0
          ? unpublished === 0
            ? `All ${rooms.length} room(s) published`
            : `${rooms.length - unpublished}/${rooms.length} published — ${unpublished} empty room(s) still hidden, fine until used`
          : `${occupiedUnpublished.length} room(s) hold delegates but are unpublished — reps cannot see them: ${occupiedUnpublished.slice(0, 5).map((r) => r.name).join(", ")}`,
      link: "/admin/accommodation",
      linkLabel: "Rooms",
    });

    // 5. Assignment coverage (§4–6): every roomable delegate has a room.
    items.push({
      key: "assignments",
      label: "Delegates assigned to rooms",
      status: unassigned === 0 ? "ok" : "warn",
      detail:
        unassigned === 0
          ? `All ${roomableGuests.length} check-in-eligible delegate(s) assigned`
          : `${unassigned} of ${roomableGuests.length} eligible delegate(s) unassigned — the desk will have to refer them (§17)`,
      link: "/admin/accommodation",
      linkLabel: "Rooms",
    });

    return {
      daysUntilArrival,
      arrivalPassed: now >= ARRIVAL_DATE,
      overallOk: items.every((item) => item.status === "ok"),
      items,
      perType,
    };
  },
});
