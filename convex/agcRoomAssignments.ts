import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";
import { writeAuditLog } from "./lib/audit";
import { agcAccommodationType, agcGender } from "./schemaTypes";
import type { AgcGender } from "./schemaTypes";
import { AGC_ACCOMMODATION_LABELS } from "../src/lib/agcPortal";
import { getRepByToken } from "./agcPortal";

/**
 * Room-assignment workflow (admin accommodation area).
 *
 * Rooms are physical rooms within an accommodation *type*; `size` is the bed
 * count. Assignments are one row per occupied bed. Capacity is enforced at
 * assignment time; gender mixing in shared rooms can be locked with a room
 * `gender` value (null = any).
 */

const ROOM_AREA_ROLES = ["admin", "accommodation"] as const;

/** Role gate for node actions (import/template) — mirrors requireArea. */
export const requireRoomAccess = internalQuery({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    return await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
  },
});
/** Roles that may assign/change delegates (Phase 2 §2 includes room-assignment staff). */
const ASSIGN_ROLES = ["admin", "accommodation", "room_assignment", "checkin"] as const;

/** Live (open) assignment rows — moved/removed rows are closed, never deleted (§9). */
function isOpen(a: Doc<"agcRoomAssignments">): boolean {
  return a.endedAt === undefined;
}

/** Open assignments for one room. */
async function openAssignmentsForRoom(
  ctx: MutationCtx | QueryCtx,
  roomId: string,
): Promise<Doc<"agcRoomAssignments">[]> {
  const rows = await ctx.db
    .query("agcRoomAssignments")
    .withIndex("by_room", (q) => q.eq("roomId", roomId as Id<"agcRooms">))
    .collect();
  return rows.filter(isOpen);
}

async function requireArea(ctx: MutationCtx | QueryCtx, sessionToken: string) {
  return requireRole(ctx, sessionToken, [...ROOM_AREA_ROLES]);
}

// ------------------------------------------------------------------
// Room CRUD
// ------------------------------------------------------------------

/** All rooms for the room grid, with live occupancy counts. */
export const listRoomsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ASSIGN_ROLES]);
    const rooms = (await ctx.db.query("agcRooms").collect()).filter(
      (room) => !room.deletedAt,
    );
    const assignments = (await ctx.db.query("agcRoomAssignments").collect()).filter(isOpen);
    const occupiedByRoom = new Map<string, Doc<"agcRoomAssignments">[]>();
    for (const assignment of assignments) {
      const list = occupiedByRoom.get(assignment.roomId) ?? [];
      list.push(assignment);
      occupiedByRoom.set(assignment.roomId, list);
    }
    return rooms
      .map((room) => ({
        _id: room._id,
        accommodationType: room.accommodationType,
        name: room.name,
        building: room.building ?? null,
        gender: room.gender ?? null,
        capacity: room.capacity,
        note: room.note ?? null,
        publishedAt: room.publishedAt ?? null,
        publishedBy: room.publishedBy ?? null,
        occupants: (occupiedByRoom.get(room._id) ?? []).length,
        assignments: (occupiedByRoom.get(room._id) ?? []).map((a) => ({
          _id: a._id,
          guestId: a.guestId,
          bookingId: a.bookingId,
        })),
      }))
      .sort(
        (a, b) =>
          a.accommodationType.localeCompare(b.accommodationType) ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
  },
});

export const upsertRoom = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.optional(v.id("agcRooms")),
    accommodationType: agcAccommodationType,
    name: v.string(),
    building: v.optional(v.string()),
    gender: v.optional(agcGender),
    capacity: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireArea(ctx, args.sessionToken);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Room name is required");
    if (args.capacity <= 0) throw new ConvexError("Capacity must be positive");
    // EBPV is an apartment unit assigned to delegates, rooms self-allocated
    // by occupants — Phase 2 §7 caps a unit at four registered delegates.
    if (args.accommodationType === "ebpv") {
      if (args.capacity > 4) {
        throw new ConvexError(
          `An EBPV apartment holds at most 4 delegates (given ${args.capacity})`,
        );
      }
      if (args.gender) {
        throw new ConvexError("EBPV apartments are mixed-gender — remove the gender lock");
      }
    }

    if (args.roomId) {
      const room = await ctx.db.get(args.roomId);
      if (!room || room.deletedAt) throw new ConvexError("Room not found");
      const occupants = await openAssignmentsForRoom(ctx, room._id);
      // Never shrink a room below its current occupancy.
      if (args.capacity < occupants.length) {
        throw new ConvexError(
          `This room currently holds ${occupants.length} guest(s) — capacity cannot be smaller`,
        );
      }
      await ctx.db.patch(room._id, {
        accommodationType: args.accommodationType,
        name,
        building: args.building,
        gender: args.gender,
        capacity: args.capacity,
      });

      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "agc_room.updated",
        entityType: "agcRooms",
        entityId: room._id,
        summary: `Updated room ${name} by ${actor.email}`,
      });
      return { roomId: room._id };
    }

    // Duplicate names within a type would make rooming lists ambiguous.
    const existing = (await ctx.db.query("agcRooms").collect()).find(
      (room) => !room.deletedAt && room.name === name,
    );
    if (existing) {
      throw new ConvexError(`A room named "${name}" already exists`);
    }
    const roomId = await ctx.db.insert("agcRooms", {
      accommodationType: args.accommodationType,
      name,
      building: args.building,
      gender: args.gender,
      capacity: args.capacity,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.created",
      entityType: "agcRooms",
      entityId: roomId,
      summary: `Created room ${name} by ${actor.email}`,
    });
    return { roomId };
  },
});

export const deleteRoom = mutation({
  args: { sessionToken: v.string(), roomId: v.id("agcRooms") },
  handler: async (ctx, args) => {
    const actor = await requireArea(ctx, args.sessionToken);
    const room = await ctx.db.get(args.roomId);
    if (!room || room.deletedAt) throw new ConvexError("Room not found");
    const occupants = await openAssignmentsForRoom(ctx, room._id);
    if (occupants.length > 0) {
      throw new ConvexError(
        `Move the ${occupants.length} guest(s) out of ${room.name} first`,
      );
    }
    await ctx.db.patch(room._id, { deletedAt: Date.now() });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.deleted",
      entityType: "agcRooms",
      entityId: room._id,
      summary: `Deleted room ${room.name} by ${actor.email}`,
    });
    return { success: true as const };
  },
});

/**
 * The live rooms a bulk action addresses: explicit ids, a building, one
 * accommodation type, or every room. Bulk passes matter because an imported
 * workbook carries no building column, so blocks are not always available.
 */
async function resolveRoomScope(
  ctx: MutationCtx,
  scope: {
    roomIds?: Id<"agcRooms">[];
    building?: string;
    accommodationType?: Doc<"agcRooms">["accommodationType"];
    all?: boolean;
  },
): Promise<Doc<"agcRooms">[]> {
  if (scope.roomIds && scope.roomIds.length > 0) {
    const rooms = await Promise.all(scope.roomIds.map((id) => ctx.db.get(id)));
    return rooms.filter(
      (room): room is Doc<"agcRooms"> => !!room && !room.deletedAt,
    );
  }
  const rooms = (await ctx.db.query("agcRooms").collect()).filter(
    (room) => !room.deletedAt,
  );
  if (scope.building) {
    return rooms.filter((room) => room.building === scope.building);
  }
  if (scope.accommodationType) {
    return rooms.filter(
      (room) => room.accommodationType === scope.accommodationType,
    );
  }
  if (scope.all) return rooms;
  throw new ConvexError("Choose rooms, a building, a type or all rooms");
}

/**
 * Bulk delete (soft). Rooms still holding delegates are kept and reported —
 * nobody is ever orphaned by a sweep — and the audit log records the scope.
 */
export const deleteRooms = mutation({
  args: {
    sessionToken: v.string(),
    roomIds: v.optional(v.array(v.id("agcRooms"))),
    building: v.optional(v.string()),
    accommodationType: v.optional(agcAccommodationType),
    all: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    const rooms = await resolveRoomScope(ctx, args);
    if (rooms.length === 0) throw new ConvexError("No matching rooms");

    let deleted = 0;
    const kept: string[] = [];
    for (const room of rooms) {
      const occupants = await openAssignmentsForRoom(ctx, room._id);
      if (occupants.length > 0) {
        kept.push(room.name);
        continue;
      }
      await ctx.db.patch(room._id, { deletedAt: Date.now() });
      deleted += 1;
    }
    if (deleted === 0) {
      throw new ConvexError(
        `All ${kept.length} matching room(s) still hold delegates — move them out first`,
      );
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.deleted_bulk",
      entityType: "agcRooms",
      summary: `Bulk-deleted ${deleted} room(s) by ${actor.email}${kept.length > 0 ? `, kept ${kept.length} with delegates` : ""}`,
      metadata: {
        deleted,
        kept: kept.length,
        keptNames: kept.slice(0, 25),
        building: args.building ?? null,
        accommodationType: args.accommodationType ?? null,
        all: args.all ?? false,
      },
    });
    return { deleted, kept: kept.length, keptNames: kept.slice(0, 25) };
  },
});

/**
 * Soft-deleted rooms, newest first — the undo list behind a mistaken delete or
 * bulk sweep. `nameTaken` marks a room whose type and name were re-created
 * since (typically by re-importing the workbook), so restoring it would
 * duplicate a live room.
 */
export const listDeletedRoomsAdmin = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    const all = await ctx.db.query("agcRooms").collect();
    const liveKeys = new Set(
      all
        .filter((room) => !room.deletedAt)
        .map((room) => roomImportKey(room.accommodationType, room.name)),
    );
    const deleted = all
      .filter((room) => room.deletedAt !== undefined)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    return {
      total: deleted.length,
      rooms: deleted.slice(0, 200).map((room) => ({
        _id: room._id,
        accommodationType: room.accommodationType,
        name: room.name,
        building: room.building ?? null,
        capacity: room.capacity,
        publishedAt: room.publishedAt ?? null,
        deletedAt: room.deletedAt as number,
        nameTaken: liveKeys.has(
          roomImportKey(room.accommodationType, room.name),
        ),
      })),
    };
  },
});

/**
 * Undo a delete. A room comes back exactly as it left — same name, block,
 * gender lock, capacity and published state. When a room of the same type and
 * name exists again, the live one keeps its place and the stale copy is
 * reported rather than duplicating the inventory.
 */
export const restoreRooms = mutation({
  args: { sessionToken: v.string(), roomIds: v.array(v.id("agcRooms")) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    if (args.roomIds.length === 0) {
      throw new ConvexError("Choose the rooms to restore");
    }
    const liveKeys = new Set(
      (await ctx.db.query("agcRooms").collect())
        .filter((room) => !room.deletedAt)
        .map((room) => roomImportKey(room.accommodationType, room.name)),
    );

    let restored = 0;
    const conflicts: string[] = [];
    for (const id of args.roomIds) {
      const room = await ctx.db.get(id);
      if (!room || room.deletedAt === undefined) continue;
      const key = roomImportKey(room.accommodationType, room.name);
      if (liveKeys.has(key)) {
        conflicts.push(room.name);
        continue;
      }
      await ctx.db.patch(room._id, { deletedAt: undefined });
      liveKeys.add(key);
      restored += 1;
    }

    if (restored === 0) {
      throw new ConvexError(
        conflicts.length > 0
          ? `Nothing restored — ${conflicts.length} room(s) already exist under the same name`
          : "Nothing to restore — those rooms are already back",
      );
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.restored",
      entityType: "agcRooms",
      summary: `Restored ${restored} deleted room(s) by ${actor.email}${conflicts.length > 0 ? `, skipped ${conflicts.length} with a live namesake` : ""}`,
      metadata: {
        restored,
        conflicts: conflicts.length,
        conflictNames: conflicts.slice(0, 25),
      },
    });
    return {
      restored,
      conflictCount: conflicts.length,
      conflicts: conflicts.slice(0, 25),
    };
  },
});

// ------------------------------------------------------------------
// Assignments
// ------------------------------------------------------------------

/**
 * A booking is roomable once it is paid+confirmed — or while it is on
 * payment-on-arrival terms (beds are held, payment credited later).
 */
export function isRoomableBooking(booking: {
  deletedAt?: number;
  bookingStatus: string;
  paymentMode: string;
  poa?: { status: string } | null;
}): boolean {
  if (booking.deletedAt !== undefined) return false;
  if (booking.bookingStatus === "confirmed") return true;
  return (
    booking.paymentMode === "payment_on_arrival" &&
    booking.bookingStatus === "reserved" &&
    booking.poa?.status !== "confirmed" // (defensive; confirmed implies bookingStatus confirmed)
  );
}

/**
 * Guests eligible for rooming: active guests whose booking is confirmed
 * (paid) and who have no assignment yet. Grouped by type + gender.
 */
export const listUnassignedGuestsAdmin = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    const guests = await ctx.db.query("agcGuests").collect();
    const bookings = await ctx.db.query("agcBookings").collect();
    const bookingById = new Map(bookings.map((b) => [b._id, b]));
    const assignedGuestIds = new Set(
      (await ctx.db.query("agcRoomAssignments").collect()).filter(isOpen).map((a) => a.guestId),
    );
    const hubs = await ctx.db.query("agcHubs").collect();
    const hubName = new Map(hubs.map((hub) => [hub._id, hub.name]));

    return guests
      .filter((guest) => {
        if (guest.status !== "active") return false;
        if (assignedGuestIds.has(guest._id)) return false;
        const booking = bookingById.get(guest.bookingId);
        if (!booking) return false;
        return isRoomableBooking(booking);
      })
      .map((guest) => {
        const booking = bookingById.get(guest.bookingId);
        return {
          _id: guest._id as string,
          bookingId: guest.bookingId as string,
          name: `${guest.title} ${guest.firstName} ${guest.lastName}`.trim(),
          firstName: guest.firstName,
          lastName: guest.lastName,
          gender: guest.gender,
          accommodationType: guest.accommodationType,
          isBishopRate: guest.isBishopRate,
          hubName: booking ? hubName.get(booking.hubId) ?? "(unknown)" : "(unknown)",
          bookingRef: booking?.referenceNumber ?? "",
        };
      })
      .sort(
        (a, b) =>
          a.accommodationType.localeCompare(b.accommodationType) ||
          a.gender.localeCompare(b.gender) ||
          a.lastName.localeCompare(b.lastName),
      );
  },
});

/**
 * Assignment validity + occupancy guard shared by assign, changeRoom and
 * autoAssign. Enforces Phase 2 §4: capacity, room-level gender lock, and
 * one-gender-per-room for dormitories and hostels.
 */
async function assertAssignable(
  ctx: MutationCtx,
  args: {
    roomId: Id<"agcRooms">;
    guestIds: Id<"agcGuests">[];
    skipGuestId?: Id<"agcGuests">;
  },
) {
  const room = await ctx.db.get(args.roomId);
  if (!room || room.deletedAt) throw new ConvexError("Room not found");

  const current = await openAssignmentsForRoom(ctx, room._id);
  const currentGuestIds = new Set(
    current.map((a) => a.guestId).filter((id) => id !== args.skipGuestId),
  );
  const bedsFree = room.capacity - currentGuestIds.size;
  if (args.guestIds.length > bedsFree) {
    throw new ConvexError(
      `${room.name} has only ${bedsFree} bed(s) free (capacity ${room.capacity})`,
    );
  }

  // Gather who currently occupies the room so shared-room gender can be
  // validated as a whole (§4: one gender per dormitory/hostel room).
  const residentGenders = new Set<AgcGender>();
  for (const guestId of currentGuestIds) {
    const g = await ctx.db.get(guestId);
    if (g) residentGenders.add(g.gender);
  }
  for (const guestId of args.guestIds) {
    if (currentGuestIds.has(guestId)) continue;
    const g = await ctx.db.get(guestId);
    if (g) residentGenders.add(g.gender);
  }

  // Explicit room-level gender lock (any accommodation type).
  if (room.gender && residentGenders.size > 0) {
    const [first] = residentGenders;
    if (first !== room.gender) {
      throw new ConvexError(`${room.name} is reserved for ${room.gender} guests`);
    }
  }

  // Dormitories and hostels: one gender per room, always (§4).
  if (
    (room.accommodationType === "dormitory" || room.accommodationType === "hostel") &&
    residentGenders.size > 1
  ) {
    const genders = [...residentGenders].join(" + ");
    throw new ConvexError(
      `${room.name} must hold a single gender — found ${genders}`,
    );
  }

  // Guests must match the room's accommodation type — a dorm room can't
  // take an EBPV guest (pricing/inventory differ per type).
  const incoming: Doc<"agcGuests">[] = [];
  for (const guestId of args.guestIds) {
    const guest = await ctx.db.get(guestId);
    if (!guest || guest.status !== "active") {
      throw new ConvexError("Guest is not active — refresh the page");
    }
    const assignment = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", guestId))
      .unique();
    if (
      assignment &&
      isOpen(assignment) &&
      assignment.roomId !== room._id &&
      guestId !== args.skipGuestId
    ) {
      throw new ConvexError(
        `${guest.firstName} ${guest.lastName} is already in another room — remove them first`,
      );
    }
    if (guest.accommodationType !== room.accommodationType) {
      throw new ConvexError(
        `${guest.firstName} ${guest.lastName} is booked for ${labelOf(guest.accommodationType)}, not ${labelOf(room.accommodationType)}`,
      );
    }
    incoming.push(guest);
  }
  return { room, incoming };
}

function labelOf(type: Doc<"agcRooms">["accommodationType"]) {
  return AGC_ACCOMMODATION_LABELS[type] ?? type;
}

/** Assign guests into a room. Passing assignmentId moves a guest within it. */
export const assignGuests = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("agcRooms"),
    guestIds: v.array(v.id("agcGuests")),
    assignmentId: v.optional(v.id("agcRoomAssignments")),
  },
  handler: async (ctx, args) => {
    const actor = await requireArea(ctx, args.sessionToken);
    if (args.guestIds.length === 0) {
      throw new ConvexError("Select at least one guest");
    }
    if (args.assignmentId) {
      // Move: close the existing assignment (history preserved, §9), then
      // re-assign. Prefer changeRoom for cross-room moves.
      const existing = await ctx.db.get(args.assignmentId);
      if (!existing) throw new ConvexError("Assignment not found");
      await closeAssignment(ctx, existing, actor.email, "Moved within room (assignment edit)");
    }
    const { room, incoming } = await assertAssignable(ctx, {
      roomId: args.roomId,
      guestIds: args.guestIds,
    });

    for (const guest of incoming) {
      const booking = await ctx.db.get(guest.bookingId);
      if (!booking || !isRoomableBooking(booking)) {
        throw new ConvexError(
          "Only guests with confirmed bookings (or payment-on-arrival bookings) can be roomed",
        );
      }
      await ctx.db.insert("agcRoomAssignments", {
        roomId: room._id,
        guestId: guest._id,
        bookingId: guest.bookingId,
        assignedBy: actor.email,
        createdAt: Date.now(),
      });
    }
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.assigned",
      entityType: "agcRooms",
      entityId: room._id,
      summary: `Assigned ${incoming.length} guest(s) to ${room.name} by ${actor.email}`,
      metadata: { guestIds: incoming.map((g) => g._id) },
    });
    return { assigned: incoming.length };
  },
});

export const unassignGuest = mutation({
  args: { sessionToken: v.string(), assignmentId: v.id("agcRoomAssignments") },
  handler: async (ctx, args) => {
    const actor = await requireArea(ctx, args.sessionToken);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new ConvexError("Assignment not found");
    const [room, guest] = await Promise.all([
      ctx.db.get(assignment.roomId),
      ctx.db.get(assignment.guestId),
    ]);
    // Close instead of delete — history must survive (Phase 2 §9).
    await ctx.db.patch(assignment._id, {
      endedAt: Date.now(),
      endBy: actor.email,
      endReason: "Removed from room by staff",
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.unassigned",
      entityType: "agcRooms",
      entityId: assignment.roomId,
      summary: `Removed ${guest ? `${guest.firstName} ${guest.lastName}` : "guest"} from ${room?.name ?? "room"} by ${actor.email}`,
    });
    return { success: true as const };
  },
});

/**
 * Core of the one-click rooming routine: fills every room bed-for-bed from
 * the matching unassigned queue (type + gender; rooms with a gender lock
 * only take that gender). Never steers guests into a room whose type
 * differs, so pool accounting stays untouched.
 *
 * Called directly by `autoAssignGuests` (admin button) and by POA payment
 * confirmation in agcPoa.ts, so confirming a payment-on-arrival booking at
 * the venue desk places its guests into rooms automatically.
 */
export async function runAutoAssignment(
  ctx: MutationCtx,
  actorEmail: string,
): Promise<{ placed: number; remaining: number; perRoom: { room: string; filled: number }[] }> {
  const [rooms, guests] = await Promise.all([
    ctx.db
      .query("agcRooms")
      .withIndex("by_type")
      .collect(),
    ctx.db.query("agcGuests").collect(),
  ]);
  const activeRooms = rooms.filter((room) => !room.deletedAt);

  const bookings = await ctx.db.query("agcBookings").collect();
  const bookingById = new Map(bookings.map((b) => [b._id as string, b]));
  const assignedGuestIds = new Set(
    (await ctx.db.query("agcRoomAssignments").collect()).filter(isOpen).map((a) => a.guestId),
  );

  type Candidate = Doc<"agcGuests">;
  const unassigned = guests.filter((guest): guest is Candidate => {
    if (guest.status !== "active") return false;
    if (assignedGuestIds.has(guest._id)) return false;
    const booking = bookingById.get(guest.bookingId);
    return !!booking && isRoomableBooking(booking);
  });

  // Occupancy snapshot (mutable working copy per room).
  const occupancy = new Map<string, Set<string>>();
  const existingAssignments = (
    await ctx.db.query("agcRoomAssignments").collect()
  ).filter(isOpen);
  for (const room of activeRooms) {
    occupancy.set(room._id, new Set());
  }
  for (const assignment of existingAssignments) {
    occupancy.get(assignment.roomId)?.add(assignment.guestId);
  }

  const pending = new Set(unassigned.map((g) => g._id));
  const perRoom: { room: string; filled: number }[] = [];

  const guestById = new Map(guests.map((g) => [g._id, g]));
  const takenGenders = new Map<string, Set<AgcGender>>();
  for (const room of activeRooms) takenGenders.set(room._id, new Set());
  for (const assignment of existingAssignments) {
    // Gender of existing occupants matters for one-gender-per-room (§4).
    const guest = guestById.get(assignment.guestId);
    if (guest) takenGenders.get(assignment.roomId)?.add(guest.gender);
  }

  for (const room of activeRooms.sort((a, b) => a.name.localeCompare(b.name))) {
    const taken = new Set(occupancy.get(room._id) ?? []);
    const genders = takenGenders.get(room._id) ?? new Set<AgcGender>();
    const bedsBefore = taken.size;
    while (taken.size < room.capacity) {
      const pick = unassigned
        .filter(
          (guest) =>
            pending.has(guest._id) &&
            guest.accommodationType === room.accommodationType &&
            (!room.gender || guest.gender === room.gender) &&
            // Dorms/hostels already holding a gender must stay single-sex.
            (
              genders.size === 0 ||
              (
                (room.accommodationType !== "dormitory" && room.accommodationType !== "hostel") ||
                (genders.size === 1 && genders.has(guest.gender))
              )
            ),
        )
        // Prefer guests from the same booking to keep hubs together.
        .sort(
          (a, b) =>
            a.bookingId.localeCompare(b.bookingId) ||
            a.lastName.localeCompare(b.lastName),
        )[0];
      if (!pick) break;
      await ctx.db.insert("agcRoomAssignments", {
        roomId: room._id,
        guestId: pick._id,
        bookingId: pick.bookingId,
        assignedBy: actorEmail,
        createdAt: Date.now(),
      });
      pending.delete(pick._id);
      taken.add(pick._id);
      genders.add(pick.gender);
    }
    const filled = taken.size - bedsBefore;
    if (filled > 0) perRoom.push({ room: room.name, filled });
  }

  await writeAuditLog(ctx, {
    actorEmail,
    action: "agc_room.auto_assigned",
    entityType: "agcRooms",
    summary: `Auto room assignment by ${actorEmail}: ${perRoom.reduce((sum, r) => sum + r.filled, 0)} guest(s) placed`,
  });
  return {
    placed: perRoom.reduce((sum, r) => sum + r.filled, 0),
    remaining: [...pending].length,
    perRoom,
  };
}

/**
 * One-click rooming: fills every room bed-for-bed from the matching
 * unassigned queue (type + gender, bishops kept together where flagged).
 * Rooms with a gender lock only take that gender. Never steers guests into
 * a room whose type differs, so pool accounting stays untouched.
 * Returns per-room fill counts to surface as a toast.
 */
export const autoAssignGuests = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireArea(ctx, args.sessionToken);
    return await runAutoAssignment(ctx, actor.email);
  },
});

// ------------------------------------------------------------------
// Rooming list (print)
// ------------------------------------------------------------------

/** Rooming-list rows for the printable handout, optionally filtered by type. */
export const getRoomingList = query({
  args: { sessionToken: v.string(), accommodationType: v.optional(agcAccommodationType) },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin", "accommodation", "finance"]);
    const rooms = (await ctx.db
      .query("agcRooms")
      .withIndex("by_type")
      .collect()
    ).filter(
      (room) => !room.deletedAt && (!args.accommodationType || room.accommodationType === args.accommodationType),
    );
    const assignments = (await ctx.db.query("agcRoomAssignments").collect()).filter(isOpen);
    const guestById = new Map(
      (await ctx.db.query("agcGuests").collect()).map((g) => [g._id, g]),
    );
    const bookings = await ctx.db.query("agcBookings").collect();
    const bookingById = new Map(bookings.map((b) => [b._id, b]));
    const hubName = new Map(
      (await ctx.db.query("agcHubs").collect()).map((hub) => [hub._id, hub.name]),
    );

    return rooms
      .sort(
        (a, b) =>
          a.accommodationType.localeCompare(b.accommodationType) ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      )
      .map((room) => ({
        _id: room._id,
        accommodationType: room.accommodationType,
        typeLabel: labelOf(room.accommodationType),
        name: room.name,
        building: room.building ?? null,
        gender: room.gender ?? null,
        capacity: room.capacity,
        occupants: assignments
          .filter((a) => a.roomId === room._id)
          .map((a) => {
            const guest = guestById.get(a.guestId);
            const booking = bookingById.get(a.bookingId);
            return {
              _id: a.guestId,
              name: guest
                ? `${guest.title} ${guest.firstName} ${guest.lastName}`.trim()
                : "(missing guest)",
              gender: guest?.gender ?? null,
              hubName: booking ? hubName.get(booking.hubId) ?? "(unknown)" : "(unknown)",
              bookingRef: booking?.referenceNumber ?? "",
            };
          }),
      }));
  },
});

// ------------------------------------------------------------------
// Room changes with history (Phase 2 §9)
// ------------------------------------------------------------------

/** Close an assignment row — the row itself always survives. */
async function closeAssignment(
  ctx: MutationCtx,
  assignment: Doc<"agcRoomAssignments">,
  endBy: string,
  endReason: string,
) {
  await ctx.db.patch(assignment._id, {
    endedAt: Date.now(),
    endBy,
    endReason,
  });
}

/**
 * Move a guest to a different room. Validates the destination, closes the
 * previous assignment and creates the new one with a `replacedByAssignmentId`
 * link so history is a chain — never a deletion. A reason is required (§9).
 */
export const changeRoom = mutation({
  args: {
    sessionToken: v.string(),
    guestId: v.id("agcGuests"),
    toRoomId: v.id("agcRooms"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.sessionToken, [...ASSIGN_ROLES]);
    return await performChangeRoom(ctx, { userId: user._id, email: user.email }, args);
  },
});

/** Core room change, shared with offline replay (§19). */
export async function performChangeRoom(
  ctx: MutationCtx,
  actor: { userId?: Id<"users">; email: string; role?: string },
  args: {
    guestId: Id<"agcGuests">;
    toRoomId: Id<"agcRooms">;
    reason: string;
    offlineTxId?: string;
  },
): Promise<{ fromAssignmentId: Id<"agcRoomAssignments">; toAssignmentId: Id<"agcRoomAssignments"> }> {
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("A reason is required for a room change");

    const guest = await ctx.db.get(args.guestId);
    if (!guest || guest.status !== "active") {
      throw new ConvexError("Guest not found or not active");
    }
    const current = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", guest._id))
      .unique();
    if (!current || !isOpen(current)) {
      throw new ConvexError(
        `${guest.firstName} ${guest.lastName} has no current room assignment`,
      );
    }
    if (current.roomId === args.toRoomId) {
      throw new ConvexError("The guest is already in that room");
    }

    const fromRoom = await ctx.db.get(current.roomId);
    const { room: toRoom } = await assertAssignable(ctx, {
      roomId: args.toRoomId,
      guestIds: [guest._id],
      skipGuestId: guest._id,
    });

    await closeAssignment(ctx, current, actor.email, `Moved to ${toRoom.name}: ${reason}`);
    const newAssignmentId = await ctx.db.insert("agcRoomAssignments", {
      roomId: toRoom._id,
      guestId: guest._id,
      bookingId: guest.bookingId,
      assignedBy: actor.email,
      createdAt: Date.now(),
    });
    await ctx.db.patch(current._id, { replacedByAssignmentId: newAssignmentId });

    await writeAuditLog(ctx, {
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: "agc_room.changed",
      entityType: "agcRooms",
      entityId: toRoom._id,
      summary: `Moved ${guest.firstName} ${guest.lastName} from ${fromRoom?.name ?? "room"} to ${toRoom.name} — reason: ${reason}`,
      metadata: {
        guestId: guest._id,
        fromRoomId: current.roomId,
        toRoomId: toRoom._id,
        reason,
        offlineTxId: args.offlineTxId,
      },
    });
    return { fromAssignmentId: current._id, toAssignmentId: newAssignmentId };
}

/** Reassigned/moved/removal history for one room (newest first). */
export const getRoomHistory = query({
  args: { sessionToken: v.string(), roomId: v.id("agcRooms") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    const rows = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    const guestById = new Map(
      (await ctx.db.query("agcGuests").collect()).map((g) => [g._id, g]),
    );
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => {
        const guest = guestById.get(row.guestId);
        return {
          _id: row._id,
          guestName: guest
            ? `${guest.title} ${guest.firstName} ${guest.lastName}`.trim()
            : "(missing guest)",
          assignedBy: row.assignedBy ?? "",
          createdAt: row.createdAt,
          endedAt: row.endedAt ?? null,
          endBy: row.endBy ?? null,
          endReason: row.endReason ?? null,
        };
      });
  },
});

/** Assignment-change history for one guest (newest first). */
export const getGuestRoomHistory = query({
  args: { sessionToken: v.string(), guestId: v.id("agcGuests") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    const rows = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", args.guestId))
      .collect();
    const roomById = new Map(
      (await ctx.db.query("agcRooms").collect()).map((r) => [r._id, r]),
    );
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        _id: row._id,
        roomId: row.roomId,
        roomName: roomById.get(row.roomId)?.name ?? "(deleted room)",
        assignedBy: row.assignedBy ?? "",
        createdAt: row.createdAt,
        endedAt: row.endedAt ?? null,
        endBy: row.endBy ?? null,
        endReason: row.endReason ?? null,
        current: isOpen(row),
      }));
  },
});

// ------------------------------------------------------------------
// Publishing (Phase 2 §8) — Accommodation Admin only
// ------------------------------------------------------------------

/**
 * Publish rooms for rep visibility: explicit room ids, a whole building, one
 * accommodation type, or every room at once — bulk passes matter because an
 * imported workbook carries no building column, so blocks are not always
 * available to scope by.
 */
export const publishRooms = mutation({
  args: {
    sessionToken: v.string(),
    roomIds: v.optional(v.array(v.id("agcRooms"))),
    building: v.optional(v.string()),
    /** Every room of one accommodation type. */
    accommodationType: v.optional(agcAccommodationType),
    /** Every room, regardless of type or building. */
    all: v.optional(v.boolean()),
    publish: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);

    const rooms = await resolveRoomScope(ctx, args);
    if (rooms.length === 0) throw new ConvexError("No matching rooms");
    const matched = rooms.length;

    // Only touch rooms whose visibility actually changes, so a repeat bulk
    // pass keeps each room's original publish timestamp.
    const changing = rooms.filter(
      (room) => (room.publishedAt !== undefined) !== args.publish,
    );
    if (changing.length === 0) {
      return { count: 0, matched };
    }

    const now = Date.now();
    for (const room of changing) {
      await ctx.db.patch(room._id, {
        publishedAt: args.publish ? now : undefined,
        publishedBy: args.publish ? actor.email : undefined,
      });
    }
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: args.publish ? "agc_room.published" : "agc_room.unpublished",
      entityType: "agcRooms",
      summary: `${args.publish ? "Published" : "Unpublished"} ${changing.length} room(s) by ${actor.email}`,
      metadata: {
        roomIds: changing.map((room) => room._id),
        building: args.building ?? null,
        accommodationType: args.accommodationType ?? null,
        all: args.all ?? false,
      },
    });
    return { count: changing.length, matched };
  },
});

// ------------------------------------------------------------------
// Excel inventory import (Phase 2 §3) — commit side. The workbook parsing
// runs in the node action in agcRoomsImport.ts; this mutation applies it.
// ------------------------------------------------------------------

export type RoomImportRow = {
  accommodationType: "dormitory" | "hostel" | "wise_serpents" | "good_general" | "ebpv";
  building?: string;
  name: string;
  gender?: "male" | "female";
  capacity: number;
};

/**
 * A room's identity across imports: type + name, ignoring case and extra
 * spacing, so "ROOM 212 " and "Room  212" are the same room.
 */
function roomImportKey(type: string, name: string): string {
  return `${type}|${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Preview an import: counts per type + the total per type vs Phase 1's
 * corrected inventory pools (import may never exceed confirmed inventory).
 * Repeated rows are collapsed the same way the commit collapses them.
 */
export const previewRoomImport = query({
  args: { sessionToken: v.string(), rows: v.array(v.object({
    accommodationType: agcAccommodationType,
    building: v.optional(v.string()),
    name: v.string(),
    gender: v.optional(agcGender),
    capacity: v.number(),
  })) },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    const rooms = (await ctx.db.query("agcRooms").collect()).filter((room) => !room.deletedAt);
    const pools = await ctx.db.query("agcInventoryPools").collect();
    const poolTotalByType = new Map<string, number>();
    for (const pool of pools) {
      poolTotalByType.set(
        pool.accommodationType,
        (poolTotalByType.get(pool.accommodationType) ?? 0) + pool.total,
      );
    }

    const byType = new Map<
      string,
      {
        newRooms: number;
        updatedRooms: number;
        capacity: number;
        duplicateRows: number;
        duplicateRooms: number;
      }
    >();
    const existingByKey = new Map<string, number>();
    for (const room of rooms) {
      const key = roomImportKey(room.accommodationType, room.name);
      existingByKey.set(key, (existingByKey.get(key) ?? 0) + 1);
    }
    const entryFor = (type: string) => {
      const existing = byType.get(type);
      if (existing) return existing;
      const fresh = {
        newRooms: 0,
        updatedRooms: 0,
        capacity: 0,
        duplicateRows: 0,
        duplicateRooms: 0,
      };
      byType.set(type, fresh);
      return fresh;
    };

    const importedTotal = new Map<string, number>();
    const seen = new Set<string>();
    for (const row of args.rows) {
      const key = roomImportKey(row.accommodationType, row.name);
      const entry = entryFor(row.accommodationType);
      if (seen.has(key)) {
        // Repeated row — the commit ignores it, so it adds no spaces either.
        entry.duplicateRows += 1;
        continue;
      }
      seen.add(key);
      entry.capacity += row.capacity;
      importedTotal.set(
        row.accommodationType,
        (importedTotal.get(row.accommodationType) ?? 0) + row.capacity,
      );
      const existingCount = existingByKey.get(key) ?? 0;
      if (existingCount > 0) entry.updatedRooms += 1;
      else entry.newRooms += 1;
      entry.duplicateRooms += Math.max(0, existingCount - 1);
    }
    return [...byType.entries()].map(([type, entry]) => ({
      accommodationType: type,
      ...entry,
      poolTotal: poolTotalByType.get(type) ?? 0,
      withinPool: (importedTotal.get(type) ?? 0) <= (poolTotalByType.get(type) ?? 0),
    }));
  },
});

/**
 * Apply an import. Creates missing rooms, updates same-named ones (keeping
 * capacity ≥ occupancy) and refuses to exceed the type's confirmed pool
 * total. EBPV rows must stay ≤ 4 delegates, mixed-gender (Phase 2 §7).
 */
export const importRooms = mutation({
  args: {
    sessionToken: v.string(),
    rows: v.array(v.object({
      accommodationType: agcAccommodationType,
      building: v.optional(v.string()),
      name: v.string(),
      gender: v.optional(agcGender),
      capacity: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    if (args.rows.length === 0) throw new ConvexError("Nothing to import");

    const rooms = (await ctx.db.query("agcRooms").collect()).filter((room) => !room.deletedAt);
    const existingByKey = new Map<string, Doc<"agcRooms">[]>();
    for (const room of rooms) {
      const key = roomImportKey(room.accommodationType, room.name);
      const matches = existingByKey.get(key) ?? [];
      matches.push(room);
      existingByKey.set(key, matches);
    }
    // Oldest first: that row is the room an import updates, and the one a
    // duplicate sweep keeps.
    for (const matches of existingByKey.values()) {
      matches.sort((a, b) => a._creationTime - b._creationTime);
    }

    // Collapse rows that repeat a room (same type + name, ignoring case and
    // spacing) so importing a sheet twice never creates a second copy.
    const seen = new Set<string>();
    const rows: typeof args.rows = [];
    let sheetDuplicates = 0;
    for (const row of args.rows) {
      const key = roomImportKey(row.accommodationType, row.name);
      if (seen.has(key)) {
        sheetDuplicates += 1;
        continue;
      }
      seen.add(key);
      rows.push(row);
    }

    const pools = await ctx.db.query("agcInventoryPools").collect();
    const poolTotalByType = new Map<string, number>();
    for (const pool of pools) {
      poolTotalByType.set(
        pool.accommodationType,
        (poolTotalByType.get(pool.accommodationType) ?? 0) + pool.total,
      );
    }

    // Per-row shape rules (EPBV apartment, §7) before the aggregate guard.
    for (const row of rows) {
      if (row.accommodationType === "ebpv" && row.capacity > 4) {
        throw new ConvexError(
          `${row.name}: an EBPV apartment holds at most 4 delegates`,
        );
      }
      if (row.accommodationType === "ebpv" && row.gender) {
        throw new ConvexError(`${row.name}: EBPV apartments are mixed-gender`);
      }
    }

    // Capacity guard runs on the *imported* total per type.
    const importedTotal = new Map<string, number>();
    for (const row of rows) {
      importedTotal.set(row.accommodationType, (importedTotal.get(row.accommodationType) ?? 0) + row.capacity);
    }
    for (const [type, total] of importedTotal) {
      const poolTotal = poolTotalByType.get(type) ?? 0;
      if (total > poolTotal) {
        throw new ConvexError(
          `Import lists ${total} ${type} spaces but the confirmed inventory pool is only ${poolTotal}`,
        );
      }
    }

    let created = 0;
    let updated = 0;
    let removed = 0;
    let keptOccupied = 0;
    for (const row of rows) {
      const name = row.name.trim();
      if (!name || row.capacity <= 0) {
        throw new ConvexError(`Invalid room row: ${row.name || "(empty)"}`);
      }
      if (row.accommodationType === "ebpv" && row.capacity > 4) {
        throw new ConvexError(`${name}: an EBPV apartment holds at most 4 delegates`);
      }
      if (row.accommodationType === "ebpv" && row.gender) {
        throw new ConvexError(`${name}: EBPV apartments are mixed-gender`);
      }
      const key = roomImportKey(row.accommodationType, name);
      const matches = existingByKey.get(key) ?? [];
      const existing = matches[0];
      if (existing) {
        const occupants = await openAssignmentsForRoom(ctx, existing._id);
        if (row.capacity < occupants.length) {
          throw new ConvexError(
            `${name} currently holds ${occupants.length} guest(s) — imported capacity ${row.capacity} is too small`,
          );
        }
        await ctx.db.patch(existing._id, {
          // A sheet with no building/gender column must not wipe a value set
          // by hand in the UI.
          building: row.building ?? existing.building,
          gender: row.gender ?? existing.gender,
          capacity: row.capacity,
        });
        updated += 1;

        // Earlier imports may have left duplicates of this room. Keep the
        // oldest row (now carrying the imported capacity) and retire the rest,
        // unless someone is still roomed in one of them.
        for (const duplicate of matches.slice(1)) {
          const held = await openAssignmentsForRoom(ctx, duplicate._id);
          if (held.length > 0) {
            keptOccupied += 1;
            continue;
          }
          await ctx.db.patch(duplicate._id, { deletedAt: Date.now() });
          removed += 1;
        }
      } else {
        const roomId = await ctx.db.insert("agcRooms", {
          accommodationType: row.accommodationType,
          name,
          building: row.building,
          gender: row.gender ?? undefined,
          capacity: row.capacity,
        });
        existingByKey.set(key, [(await ctx.db.get(roomId)) as Doc<"agcRooms">]);
        created += 1;
      }
    }

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.imported",
      entityType: "agcRooms",
      summary: `Imported physical inventory by ${actor.email}: ${created} created, ${updated} updated, ${removed} duplicate(s) removed`,
      metadata: {
        created,
        updated,
        removed,
        keptOccupied,
        sheetDuplicates,
        rows: args.rows.length,
        importedRows: rows.length,
      },
    });
    return { created, updated, removed, keptOccupied, sheetDuplicates };
  },
});

// ------------------------------------------------------------------
// Rep-portal visibility (Phase 2 §8) — published rooms, own hub only
// ------------------------------------------------------------------

export type RepRoomAssignment = {
  roomId: string;
  name: string;
  building: string | null;
  accommodationType: string;
  typeLabel: string;
  capacity: number;
  publishedAt: number; occupants: Array<{
    guestId: string;
    name: string;
    gender: string;
    bookingRef: string;
    checkedIn: boolean;
  }>;
};

/**
 * Own-hub published room assignments. Only rooms an Accommodation Admin has
 * published appear (§8); only guests belonging to this rep's bookings are
 * listed in each room, so reps never see other hubs' delegates.
 */
export const getRepRoomAssignments = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<RepRoomAssignment[]> => {
    const result = await getRepByToken(ctx, args.sessionToken);
    if (!result) return [];
    const { rep } = result;

    const bookings = (
      await ctx.db
        .query("agcBookings")
        .withIndex("by_hub", (q) => q.eq("hubId", rep.hubId))
        .collect()
    ).filter((b) => !b.deletedAt && b.repId === rep._id);
    const ownBookingIds = new Set(bookings.map((b) => b._id));
    if (ownBookingIds.size === 0) return [];

    const guests = (
      await ctx.db.query("agcGuests").collect()
    ).filter((g) => ownBookingIds.has(g.bookingId) && g.status === "active");
    if (guests.length === 0) return [];

    const assignments = (await ctx.db.query("agcRoomAssignments").collect()).filter(
      (a) => a.endedAt === undefined,
    );
    const checkIns = (await ctx.db.query("agcCheckIns").collect()).filter(
      (c) => !c.correctedAt,
    );
    const checkedInGuestIds = new Set(
      checkIns.filter((c) => !c.checkedOutAt).map((c) => c.guestId),
    );

    const roomIds = new Set(
      assignments.map((a) => a.roomId).filter(Boolean),
    );
    const rooms = (await ctx.db.query("agcRooms").collect()).filter(
      (room) => roomIds.has(room._id) && !room.deletedAt && !!room.publishedAt,
    );

    const rows: RepRoomAssignment[] = [];
    for (const room of rooms) {
      const occupants = assignments
        .filter((a) => a.roomId === room._id)
        .map((a) => {
          const guest = guests.find((g) => g._id === a.guestId);
          if (!guest) return null; // another hub's delegate — hidden (§8)
          const booking = bookings.find((b) => b._id === guest.bookingId);
          return {
            guestId: guest._id,
            name: `${guest.title} ${guest.firstName} ${guest.lastName}`.trim(),
            gender: guest.gender,
            bookingRef: booking?.referenceNumber ?? "",
            checkedIn: checkedInGuestIds.has(guest._id),
          };
        })
        .filter((o): o is NonNullable<typeof o> => o !== null);
      if (occupants.length === 0) continue; // none of ours live here
      rows.push({
        roomId: room._id,
        name: room.name,
        building: room.building ?? null,
        accommodationType: room.accommodationType,
        typeLabel: labelOf(room.accommodationType),
        capacity: room.capacity,
        publishedAt: room.publishedAt as number,
        occupants,
      });
    }
    return rows.sort(
      (a, b) =>
        a.accommodationType.localeCompare(b.accommodationType) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  },
});
