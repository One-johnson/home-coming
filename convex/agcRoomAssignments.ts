import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";
import { writeAuditLog } from "./lib/audit";
import { agcAccommodationType, agcGender } from "./schemaTypes";
import { AGC_ACCOMMODATION_LABELS } from "../src/lib/agcPortal";

/**
 * Room-assignment workflow (admin accommodation area).
 *
 * Rooms are physical rooms within an accommodation *type*; `size` is the bed
 * count. Assignments are one row per occupied bed. Capacity is enforced at
 * assignment time; gender mixing in shared rooms can be locked with a room
 * `gender` value (null = any).
 */

const ROOM_AREA_ROLES = ["admin", "accommodation"] as const;

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
    await requireRole(ctx, args.sessionToken, [...ROOM_AREA_ROLES]);
    const rooms = (await ctx.db.query("agcRooms").collect()).filter(
      (room) => !room.deletedAt,
    );
    const assignments = await ctx.db.query("agcRoomAssignments").collect();
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
        gender: room.gender ?? null,
        capacity: room.capacity,
        note: room.note ?? null,
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
    gender: v.optional(agcGender),
    capacity: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireArea(ctx, args.sessionToken);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Room name is required");
    if (args.capacity <= 0) throw new ConvexError("Capacity must be positive");

    if (args.roomId) {
      const room = await ctx.db.get(args.roomId);
      if (!room || room.deletedAt) throw new ConvexError("Room not found");
      const occupants = await ctx.db
        .query("agcRoomAssignments")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();
      // Never shrink a room below its current occupancy.
      if (args.capacity < occupants.length) {
        throw new ConvexError(
          `This room currently holds ${occupants.length} guest(s) — capacity cannot be smaller`,
        );
      }
      await ctx.db.patch(room._id, {
        accommodationType: args.accommodationType,
        name,
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
    const occupants = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
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
      (await ctx.db.query("agcRoomAssignments").collect()).map((a) => a.guestId),
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

/** Assignment validity + occupancy guard shared by assign and autoAssign. */
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

  const current = await ctx.db
    .query("agcRoomAssignments")
    .withIndex("by_room", (q) => q.eq("roomId", room._id))
    .collect();
  const currentGuestIds = new Set(
    current.map((a) => a.guestId).filter((id) => id !== args.skipGuestId),
  );
  const bedsFree = room.capacity - currentGuestIds.size;
  if (args.guestIds.length > bedsFree) {
    throw new ConvexError(
      `${room.name} has only ${bedsFree} bed(s) free (capacity ${room.capacity})`,
    );
  }

  // Gender lock: shared rooms may be restricted to one gender.
  if (room.gender) {
    for (const guestId of args.guestIds) {
      const guest = await ctx.db.get(guestId);
      if (guest && guest.gender !== room.gender && !currentGuestIds.has(guestId)) {
        if (currentGuestIds.size > 0 || args.guestIds.length > 1) {
          throw new ConvexError(
            `${room.name} is reserved for ${room.gender} guests`,
          );
        }
      }
    }
  }

  // Guests must match the room's accommodation type — a dorm room can't
  // take an EBPV guest (pricing/inventory differ per type).
  const incoming = [];
  for (const guestId of args.guestIds) {
    const guest = await ctx.db.get(guestId);
    if (!guest || guest.status !== "active") {
      throw new ConvexError("Guest is not active — refresh the page");
    }
    const assignment = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", guestId))
      .unique();
    if (assignment && assignment.roomId !== room._id) {
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
      // Move: remove the existing assignment for that guest, then re-assign.
      const existing = await ctx.db.get(args.assignmentId);
      if (!existing) throw new ConvexError("Assignment not found");
      await ctx.db.delete(existing._id);
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
    await ctx.db.delete(assignment._id);
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
    (await ctx.db.query("agcRoomAssignments").collect()).map((a) => a.guestId),
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
  const existingAssignments = await ctx.db.query("agcRoomAssignments").collect();
  for (const room of activeRooms) {
    occupancy.set(room._id, new Set());
  }
  for (const assignment of existingAssignments) {
    occupancy.get(assignment.roomId)?.add(assignment.guestId);
  }

  const pending = new Set(unassigned.map((g) => g._id));
  const perRoom: { room: string; filled: number }[] = [];

  for (const room of activeRooms.sort((a, b) => a.name.localeCompare(b.name))) {
    const taken = new Set(occupancy.get(room._id) ?? []);
    const bedsBefore = taken.size;
    while (taken.size < room.capacity) {
      const pick = unassigned
        .filter(
          (guest) =>
            pending.has(guest._id) &&
            guest.accommodationType === room.accommodationType &&
            (!room.gender || guest.gender === room.gender),
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
    const assignments = await ctx.db.query("agcRoomAssignments").collect();
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
