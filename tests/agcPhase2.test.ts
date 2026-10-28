import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Phase 2 — room assignment completion, accommodation check-in, keys,
 * payment override and offline sync (SRS §3–§26 acceptance block).
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedStaff(
  t: TestConvex,
  role: "admin" | "accommodation" | "room_assignment" | "checkin" | "finance" | "registration",
) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256")
    .update(randomBytes(24))
    .digest("hex");
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      name: `${role}`,
      email: `${role}@example.com`,
      passwordHash: "not-a-real-hash",
      role,
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId: id,
      token,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
    return id;
  });
  return { token, userId };
}

/** Hub + rep + confirmed booking with `count` named guests of `gender`. */
async function seedConfirmedBooking(
  t: TestConvex,
  guestSpec: {
    accommodationType: "dormitory" | "hostel" | "wise_serpents" | "good_general" | "ebpv";
    gender: "male" | "female";
    count: number;
    paymentMode?: "offline" | "payment_on_arrival";
  },
) {
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const hubId: Id<"agcHubs"> = await ctx.db.insert("agcHubs", {
      name: "Test Hub",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: now,
    });
    const repId: Id<"agcRepresentatives"> = await ctx.db.insert(
      "agcRepresentatives",
      {
        hubId,
        username: "test_hub",
        passwordHash: "not-a-hash",
        profileComplete: true,
        mustChangePassword: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    );
    const bookingId: Id<"agcBookings"> = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 100,
      paymentMode: guestSpec.paymentMode ?? "offline",
      paymentStatus:
        guestSpec.paymentMode === "payment_on_arrival"
          ? "awaiting_payment"
          : "confirmed",
      bookingStatus:
        guestSpec.paymentMode === "payment_on_arrival" ? "reserved" : "confirmed",
      referenceNumber: "AGC-BK-0001",
      createdAt: now,
      updatedAt: now,
    });
    const guestIds: Id<"agcGuests">[] = [];
    for (let i = 0; i < guestSpec.count; i += 1) {
      guestIds.push(
        await ctx.db.insert("agcGuests", {
          bookingId,
          hubId,
          region: "ghana",
          country: "Ghana",
          firstName: `Guest${i}`,
          lastName: "Mensah",
          gender: guestSpec.gender,
          title: "Member",
          accommodationType: guestSpec.accommodationType,
          pool: "global",
          isBishopRate: false,
          status: "active",
          createdAt: now,
        }),
      );
    }
    return { hubId, repId, bookingId, guestIds };
  });
  return ids;
}

async function seedRoom(
  t: TestConvex,
  roomSpec: {
    accommodationType: "dormitory" | "hostel" | "wise_serpents" | "good_general" | "ebpv";
    name: string;
    capacity: number;
    building?: string;
    gender?: "male" | "female";
  },
): Promise<string> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("agcRooms", {
      accommodationType: roomSpec.accommodationType,
      name: roomSpec.name,
      building: roomSpec.building,
      gender: roomSpec.gender,
      capacity: roomSpec.capacity,
    });
  });
}

test("room import and capacity guard: wildcaps cancelled by pool totals", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "accommodation");

  // No pools seeded → 2,500 dorm beds exceed the (zero) confirmed pool.
  await expect(() =>
    t.mutation(api.agcRoomAssignments.importRooms, {
      sessionToken: token,
      rows: [
        { accommodationType: "dormitory", building: "Main", name: "Dorm hall", capacity: 2500 },
      ],
    }),
  ).rejects.toThrow(/inventory pool/);
});

test("import creates rooms and same-name rows update instead of duplicating", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "admin");

  // Seed the corrected Phase 1 inventory pools the import draws from.
  await t.run(async (ctx) => {
    await ctx.db.insert("agcInventoryPools", {
      accommodationType: "hostel",
      scope: "africa",
      total: 700,
      reserved: 0,
      confirmed: 0,
    });
  });

  // Pool allows 1,500 hostel beds in the rest_of_world pool + 700 africa.
  const result = await t.mutation(api.agcRoomAssignments.importRooms, {
    sessionToken: token,
    rows: [
      { accommodationType: "hostel", building: "Blocks 1–4", name: "Room 101", capacity: 8 },
      { accommodationType: "hostel", building: "Blocks 1–4", name: "Room 102", capacity: 8 },
    ],
  });
  expect(result.created).toBe(2);

  const rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms).toHaveLength(2);

  // Re-import same names → update, not duplicate (capacity runs to 10).
  const again = await t.mutation(api.agcRoomAssignments.importRooms, {
    sessionToken: token,
    rows: [
      { accommodationType: "hostel", building: "Blocks 1–4", name: "Room 101", capacity: 10 },
    ],
  });
  expect(again.created).toBe(0);
  expect(again.updated).toBe(1);
  const roomsAfter = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(roomsAfter).toHaveLength(2);
  expect(roomsAfter.find((room) => room.name === "Room 101")?.capacity).toBe(10);
});

test("EBPV import rejects >4 delegate apartments and gender locks", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "admin");
  await t.run(async (ctx) => {
    await ctx.db.insert("agcInventoryPools", {
      accommodationType: "ebpv",
      scope: "global",
      total: 68,
      reserved: 0,
      confirmed: 0,
    });
  });
  await expect(() =>
    t.mutation(api.agcRoomAssignments.importRooms, {
      sessionToken: token,
      rows: [
        { accommodationType: "ebpv", name: "Apartment 1", capacity: 5 },
      ],
    }),
  ).rejects.toThrow(/at most 4/);
  await expect(() =>
    t.mutation(api.agcRoomAssignments.importRooms, {
      sessionToken: token,
      rows: [
        { accommodationType: "ebpv", name: "Apartment 1", capacity: 4, gender: "male" },
      ],
    }),
  ).rejects.toThrow(/mixed-gender/);
});

test("bulk assignment enforces single-gender dorm rooms", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "accommodation");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "dormitory",
    gender: "male",
    count: 2,
  });
  // Room with an existing male occupant, roomed by staff:
  const { maleRoomId, toRemoveGuestId } = await t.run(async (ctx) => {
    const maleRoom: Id<"agcRooms"> = await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "Dorm A",
      capacity: 4,
    });
    await ctx.db.insert("agcRoomAssignments", {
      roomId: maleRoom,
      guestId: booking.guestIds[0],
      bookingId: booking.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
    return { maleRoomId: maleRoom, toRemoveGuestId: booking.guestIds[1] };
  });

  // A female guest cannot move into a male-occupied dorm room.
  const femaleBooking = await seedConfirmedBooking(t, {
    accommodationType: "dormitory",
    gender: "female",
    count: 1,
  });
  await expect(() =>
    t.mutation(api.agcRoomAssignments.assignGuests, {
      sessionToken: token,
      roomId: maleRoomId as Id<"agcRooms">,
      guestIds: [femaleBooking.guestIds[0] as Id<"agcGuests">],
      assignmentId: undefined,
    }),
  ).rejects.toThrow(/single gender/);

  void toRemoveGuestId;
});

test("changeRoom requires a reason and preserves history", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "admin");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 2,
  });
  const roomA = await seedRoom(t, { accommodationType: "hostel", name: "Room A", capacity: 2 });
  const roomB = await seedRoom(t, { accommodationType: "hostel", name: "Room B", capacity: 2 });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRoomAssignments", {
      roomId: roomA as Id<"agcRooms">,
      guestId: booking.guestIds[0] as Id<"agcGuests">,
      bookingId: booking.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });

  await expect(() =>
    t.mutation(api.agcRoomAssignments.changeRoom, {
      sessionToken: token,
      guestId: booking.guestIds[0] as Id<"agcGuests">,
      toRoomId: roomB as Id<"agcRooms">,
      reason: "  ",
    }),
  ).rejects.toThrow(/reason is required/);

  const result = await t.mutation(api.agcRoomAssignments.changeRoom, {
    sessionToken: token,
    guestId: booking.guestIds[0] as Id<"agcGuests">,
    toRoomId: roomB as Id<"agcRooms">,
    reason: "Gender mix correction",
  });
  expect(result.fromAssignmentId).toBeTruthy();

  // History: old room shows a closed row with the new link; new room open.
  const historyA = await t.query(api.agcRoomAssignments.getRoomHistory, {
    sessionToken: token,
    roomId: roomA as Id<"agcRooms">,
  });
  expect(historyA).toHaveLength(1);
  expect(historyA[0].endedAt).not.toBeNull();
  expect(historyA[0].endReason).toContain("Gender mix correction");

  const guestHistory = await t.query(api.agcRoomAssignments.getGuestRoomHistory, {
    sessionToken: token,
    guestId: booking.guestIds[0] as Id<"agcGuests">,
  });
  const open = guestHistory.find((row) => row.current);
  expect(open?.roomName).toBe("Room B");
  // Occupancy freed in room A — a new guest can be assigned there.
  const unassigned = await t.query(api.agcRoomAssignments.listUnassignedGuestsAdmin, {
    sessionToken: token,
  });
  expect(unassigned.map((g) => g._id)).toContain(booking.guestIds[1]);
});

test("publishing gates rep visibility, hub-scoped", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "admin");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 1,
  });
  const room = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Room P",
    capacity: 4,
    building: "Blocks 1–4",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRoomAssignments", {
      roomId: room as Id<"agcRooms">,
      guestId: booking.guestIds[0] as Id<"agcGuests">,
      bookingId: booking.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
    // Rep session for portal queries.
    await ctx.db.insert("agcRepSessions", {
      repId: booking.repId,
      token: "rep-session-token",
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  // Unpublished → reps see nothing.
  let repRooms = await t.query(api.agcRoomAssignments.getRepRoomAssignments, {
    sessionToken: "rep-session-token",
  });
  expect(repRooms).toHaveLength(0);

  await t.mutation(api.agcRoomAssignments.publishRooms, {
    sessionToken: token,
    roomIds: [room as Id<"agcRooms">],
    publish: true,
  });

  repRooms = await t.query(api.agcRoomAssignments.getRepRoomAssignments, {
    sessionToken: "rep-session-token",
  });
  expect(repRooms).toHaveLength(1);
  expect(repRooms[0].occupants).toHaveLength(1);
  expect(repRooms[0].occupants[0].name).toContain("Guest0");

  // A second rep in a different hub sees nothing (own hub only).
  await t.run(async (ctx) => {
    const now = Date.now();
    const hubId: Id<"agcHubs"> = await ctx.db.insert("agcHubs", {
      name: "Other Hub",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: now,
    });
    const repId: Id<"agcRepresentatives"> = await ctx.db.insert(
      "agcRepresentatives",
      {
        hubId,
        username: "other_hub",
        passwordHash: "not-a-hash",
        profileComplete: true,
        mustChangePassword: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    );
    await ctx.db.insert("agcRepSessions", {
      repId,
      token: "other-rep-session",
      expiresAt: now + 3_600_000,
      createdAt: now,
    });
  });
  const otherRooms = await t.query(api.agcRoomAssignments.getRepRoomAssignments, {
    sessionToken: "other-rep-session",
  });
  expect(otherRooms).toHaveLength(0);
});

test("room import is idempotent: repeats update in place and duplicates are removed", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "accommodation");
  await t.run(async (ctx) => {
    await ctx.db.insert("agcInventoryPools", {
      accommodationType: "hostel",
      scope: "africa",
      total: 100,
      reserved: 0,
      confirmed: 0,
    });
  });

  // The sheet repeats Room 212 with different casing/spacing — imported once.
  const first = await t.mutation(api.agcRoomAssignments.importRooms, {
    sessionToken: token,
    rows: [
      { accommodationType: "hostel", name: "Room 212", capacity: 4 },
      { accommodationType: "hostel", name: " room  212 ", capacity: 4 },
      { accommodationType: "hostel", name: "Room 213", capacity: 4 },
    ],
  });
  expect(first.created).toBe(2);
  expect(first.sheetDuplicates).toBe(1);

  let rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms.map((room) => room.name).sort()).toEqual(["Room 212", "Room 213"]);

  // Re-importing the same room updates it instead of adding a copy.
  const again = await t.mutation(api.agcRoomAssignments.importRooms, {
    sessionToken: token,
    rows: [{ accommodationType: "hostel", name: "ROOM 212", capacity: 6 }],
  });
  expect(again.created).toBe(0);
  expect(again.updated).toBe(1);
  rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms).toHaveLength(2);
  expect(rooms.find((room) => room.name === "Room 212")?.capacity).toBe(6);

  // A duplicate left behind by an earlier import is retired by the next
  // import, which also applies the building from the sheet.
  await seedRoom(t, { accommodationType: "hostel", name: "Room 212", capacity: 2 });
  const cleaned = await t.mutation(api.agcRoomAssignments.importRooms, {
    sessionToken: token,
    rows: [
      { accommodationType: "hostel", name: "Room 212", capacity: 6, building: "Block A" },
    ],
  });
  expect(cleaned.removed).toBe(1);
  rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms.filter((room) => room.name === "Room 212")).toHaveLength(1);
  expect(rooms.find((room) => room.name === "Room 212")?.building).toBe("Block A");

  // A sheet without a building column must not wipe the building set above.
  await t.mutation(api.agcRoomAssignments.importRooms, {
    sessionToken: token,
    rows: [{ accommodationType: "hostel", name: "Room 212", capacity: 6 }],
  });
  rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms.find((room) => room.name === "Room 212")?.building).toBe("Block A");

  // A duplicate somebody is actually roomed in is left alone and reported.
  const occupiedDuplicate = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Room 212",
    capacity: 4,
  });
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 1,
  });
  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: token,
    roomId: occupiedDuplicate as Id<"agcRooms">,
    guestIds: [booking.guestIds[0] as Id<"agcGuests">],
  });
  const guarded = await t.mutation(api.agcRoomAssignments.importRooms, {
    sessionToken: token,
    rows: [{ accommodationType: "hostel", name: "Room 212", capacity: 6 }],
  });
  expect(guarded.removed).toBe(0);
  expect(guarded.keptOccupied).toBe(1);
});

test("bulk delete retires empty rooms and never orphans delegates", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "accommodation");
  await seedRoom(t, { accommodationType: "hostel", name: "Empty 1", capacity: 2 });
  const occupied = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Occupied 1",
    capacity: 2,
  });
  await seedRoom(t, {
    accommodationType: "wise_serpents",
    name: "WASL 9",
    capacity: 2,
  });

  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 1,
  });
  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: token,
    roomId: occupied as Id<"agcRooms">,
    guestIds: [booking.guestIds[0] as Id<"agcGuests">],
  });

  const sweep = await t.mutation(api.agcRoomAssignments.deleteRooms, {
    sessionToken: token,
    accommodationType: "hostel",
  });
  expect(sweep.deleted).toBe(1);
  expect(sweep.kept).toBe(1);
  expect(sweep.keptNames).toEqual(["Occupied 1"]);

  const rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms.map((room) => room.name).sort()).toEqual(["Occupied 1", "WASL 9"]);

  // A scope where every room still holds delegates is refused outright.
  await expect(() =>
    t.mutation(api.agcRoomAssignments.deleteRooms, {
      sessionToken: token,
      accommodationType: "hostel",
    }),
  ).rejects.toThrow(/still hold delegates/);

  // Deleting rooms stays with the accommodation area, not the desk.
  const checker = await seedStaff(t, "checkin");
  await expect(() =>
    t.mutation(api.agcRoomAssignments.deleteRooms, {
      sessionToken: checker.token,
      all: true,
    }),
  ).rejects.toThrow();
});

test("a delete can be undone unless the room's name is back in use", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "accommodation");
  await seedRoom(t, { accommodationType: "hostel", name: "Empty 1", capacity: 2 });
  await seedRoom(t, { accommodationType: "hostel", name: "Empty 2", capacity: 2 });

  await t.mutation(api.agcRoomAssignments.deleteRooms, {
    sessionToken: token,
    accommodationType: "hostel",
  });

  // Both retired rooms are offered back.
  let undo = await t.query(api.agcRoomAssignments.listDeletedRoomsAdmin, {
    sessionToken: token,
  });
  expect(undo.total).toBe(2);
  expect(undo.rooms.every((room) => !room.nameTaken)).toBe(true);

  // Re-importing the workbook puts one of them back first — under a name that
  // only differs by case and spacing, so the old copy cannot come back too.
  await seedRoom(t, { accommodationType: "hostel", name: "EMPTY  1", capacity: 2 });
  undo = await t.query(api.agcRoomAssignments.listDeletedRoomsAdmin, {
    sessionToken: token,
  });
  const taken = undo.rooms.find((room) => room.name === "Empty 1");
  const free = undo.rooms.find((room) => room.name === "Empty 2");
  expect(taken?.nameTaken).toBe(true);
  expect(free?.nameTaken).toBe(false);
  if (!taken || !free) throw new Error("deleted rooms missing from the undo list");

  const result = await t.mutation(api.agcRoomAssignments.restoreRooms, {
    sessionToken: token,
    roomIds: [taken._id, free._id],
  });
  expect(result.restored).toBe(1);
  expect(result.conflictCount).toBe(1);
  expect(result.conflicts).toEqual(["Empty 1"]);

  const rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(
    rooms.map((room) => room.name.toLowerCase().replace(/\s+/g, " ")).sort(),
  ).toEqual(["empty 1", "empty 2"]);
  // No duplicate copy of the live room slipped in.
  expect(rooms).toHaveLength(2);

  // Restoring a room that is already back is refused, not silently repeated.
  await expect(() =>
    t.mutation(api.agcRoomAssignments.restoreRooms, {
      sessionToken: token,
      roomIds: [free._id],
    }),
  ).rejects.toThrow(/already back/);

  // The undo list stays with the accommodation area, not the desk.
  const checker = await seedStaff(t, "checkin");
  await expect(() =>
    t.query(api.agcRoomAssignments.listDeletedRoomsAdmin, {
      sessionToken: checker.token,
    }),
  ).rejects.toThrow();
  await expect(() =>
    t.mutation(api.agcRoomAssignments.restoreRooms, {
      sessionToken: checker.token,
      roomIds: [taken._id],
    }),
  ).rejects.toThrow();
});

test("bulk publish works by type or for every room, and a repeat pass is a no-op", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "accommodation");

  await seedRoom(t, { accommodationType: "hostel", name: "Hostel A", capacity: 4 });
  await seedRoom(t, { accommodationType: "hostel", name: "Hostel B", capacity: 4 });
  await seedRoom(t, { accommodationType: "wise_serpents", name: "WASL 1", capacity: 2 });
  await seedRoom(t, { accommodationType: "good_general", name: "GGL 1", capacity: 2 });

  // One type at a time — the rest stay hidden from reps.
  const byType = await t.mutation(api.agcRoomAssignments.publishRooms, {
    sessionToken: token,
    accommodationType: "hostel",
    publish: true,
  });
  expect(byType.count).toBe(2);

  let rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(
    rooms
      .filter((room) => room.publishedAt !== null)
      .map((room) => room.name)
      .sort(),
  ).toEqual(["Hostel A", "Hostel B"]);

  // Every room at once picks up the ones left behind.
  const everything = await t.mutation(api.agcRoomAssignments.publishRooms, {
    sessionToken: token,
    all: true,
    publish: true,
  });
  expect(everything.count).toBe(2);
  expect(everything.matched).toBe(4);

  rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms.every((room) => room.publishedAt !== null)).toBe(true);

  // A second pass changes nothing and keeps each room's publish timestamp.
  const stamps = new Map(rooms.map((room) => [room.name, room.publishedAt]));
  const repeat = await t.mutation(api.agcRoomAssignments.publishRooms, {
    sessionToken: token,
    all: true,
    publish: true,
  });
  expect(repeat.count).toBe(0);
  expect(repeat.matched).toBe(4);
  rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  for (const room of rooms) {
    expect(room.publishedAt).toBe(stamps.get(room.name));
  }

  // Whole-type unpublish removes them from rep visibility again.
  const hidden = await t.mutation(api.agcRoomAssignments.publishRooms, {
    sessionToken: token,
    accommodationType: "wise_serpents",
    publish: false,
  });
  expect(hidden.count).toBe(1);
  rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: token,
  });
  expect(rooms.find((room) => room.name === "WASL 1")?.publishedAt).toBeNull();
});

test("check-in: duplicate prevention, unassigned referral, and payment override gating", async () => {
  const t = createTestConvex();
  const checkSeed = await seedStaff(t, "checkin");
  const approverSeed = await seedStaff(t, "accommodation");
  const adminSeed = await seedStaff(t, "admin");

  // Confirmed booking, guests assigned to rooms.
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "wise_serpents",
    gender: "male",
    count: 2,
  });
  const room = await seedRoom(t, {
    accommodationType: "wise_serpents",
    name: "WSL Room 1",
    capacity: 2,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRoomAssignments", {
      roomId: room as Id<"agcRooms">,
      guestId: booking.guestIds[0] as Id<"agcGuests">,
      bookingId: booking.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });

  // Unassigned referral (§17).
  await expect(() =>
    t.mutation(api.agcCheckin.checkInGuest, {
      sessionToken: checkSeed.token,
      guestId: booking.guestIds[1] as Id<"agcGuests">,
      location: "central",
    }),
  ).rejects.toThrow(/no room assignment/);

  // Ordinary checkin staff cannot authorize overrides (§18).
  await expect(() =>
    t.mutation(api.agcRoomAssignments.autoAssignGuests, {
      sessionToken: checkSeed.token,
    }),
  ).rejects.toThrow(/Unauthorized/);

  const checkIn = await t.mutation(api.agcCheckin.checkInGuest, {
    sessionToken: checkSeed.token,
    guestId: booking.guestIds[0] as Id<"agcGuests">,
    location: "central",
  });
  // WSL rooms track room keys — first guest got the key.
  expect(checkIn.keyIssued).toBe(true);

  // Duplicate check-in is blocked with a clear warning (§16).
  await expect(() =>
    t.mutation(api.agcCheckin.checkInGuest, {
      sessionToken: checkSeed.token,
      guestId: booking.guestIds[0] as Id<"agcGuests">,
      location: "central",
    }),
  ).rejects.toThrow(/ALREADY CHECKED IN/);

  // Payment override on unconfirmed payment: admin-only (§18).
  const unconfirmed = await seedConfirmedBooking(t, {
    accommodationType: "good_general",
    gender: "female",
    count: 1,
  });
  const gglRoom = await seedRoom(t, {
    accommodationType: "good_general",
    name: "GGL Room 2",
    capacity: 1,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRoomAssignments", {
      roomId: gglRoom as Id<"agcRooms">,
      guestId: unconfirmed.guestIds[0] as Id<"agcGuests">,
      bookingId: unconfirmed.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
    // Make the payment unconfirmed (overrides the seeded confirmed state).
    await ctx.db.patch(unconfirmed.bookingId, {
      paymentStatus: "pending_verification",
      bookingStatus: "pending_verification",
    });
  });

  await expect(() =>
    t.mutation(api.agcCheckin.checkInGuest, {
      sessionToken: checkSeed.token,
      guestId: unconfirmed.guestIds[0] as Id<"agcGuests">,
      location: "central",
      override: { reason: "cash in hand" },
    }),
  ).rejects.toThrow(/Only the Accommodation Admin/);

  const overrideIn = await t.mutation(api.agcCheckin.checkInGuest, {
    sessionToken: adminSeed.token,
    guestId: unconfirmed.guestIds[0] as Id<"agcGuests">,
    location: "central",
    override: { reason: "Cash verified at desk" },
  });
  expect(overrideIn.checkInId).toBeTruthy();

  const overview = await t.query(api.agcCheckin.getArrivalOverview, {
    sessionToken: approverSeed.token,
  });
  expect(overview.checkedIn).toBe(2);
  expect(overview.paymentOverrides).toBe(1);
  expect(overview.keysIssued).toBe(2); // WSL + GGL

  // Check-out with key return closes the key record (§20).
  await t.mutation(api.agcCheckin.checkOutGuest, {
    sessionToken: checkSeed.token,
    guestId: booking.guestIds[0] as Id<"agcGuests">,
    keyReturnStatus: "returned",
  });
  const keys = await t.query(api.agcCheckin.listKeys, { sessionToken: adminSeed.token });
  const wslKey = keys.find((key) => key.roomName === "WSL Room 1");
  expect(wslKey?.status).toBe("returned");
});

test("EBPV keys go to the first arrival; later arrivals are told who holds them", async () => {
  const t = createTestConvex();
  const { token } = await seedStaff(t, "checkin");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "ebpv",
    gender: "male",
    count: 2,
  });
  await t.run(async (ctx) => {
    const room: Id<"agcRooms"> = await ctx.db.insert("agcRooms", {
      accommodationType: "ebpv",
      name: "Apartment 3",
      capacity: 4,
    });
    for (const guestId of booking.guestIds) {
      await ctx.db.insert("agcRoomAssignments", {
        roomId: room,
        guestId,
        bookingId: booking.bookingId,
        assignedBy: "seed",
        createdAt: Date.now(),
      });
    }
  });

  const first = await t.mutation(api.agcCheckin.checkInGuest, {
    sessionToken: token,
    guestId: booking.guestIds[0] as Id<"agcGuests">,
    location: "Everything by Prayer Village",
    keyRecipientName: "Guest0 Mensah",
  });
  expect(first.keyIssued).toBe(true);

  const second = await t.mutation(api.agcCheckin.checkInGuest, {
    sessionToken: token,
    guestId: booking.guestIds[1] as Id<"agcGuests">,
    location: "Everything by Prayer Village",
  });
  expect(second.keyIssued).toBe(false);
  expect(second.keysAlreadyIssuedTo).toContain("Guest0");
});

test("offline queue: designated-station rule, idempotent sync, conflicts flagged", async () => {
  const t = createTestConvex();
  const approver = await seedStaff(t, "accommodation");
  const staff = await seedStaff(t, "checkin");

  // Non-designated devices are refused (§19).
  await expect(() =>
    t.mutation(api.agcOffline.queueTransactions, {
      sessionToken: staff.token,
      building: "Blocks 1–4",
      stationName: "Rogue device",
      transactions: [
        {
          txId: "tx-1",
          staffId: "checkin@example.com",
          staffRole: "checkin",
          action: "check_in",
          payload: JSON.stringify({ guestId: "x" as unknown, location: "Blocks 1–4" }),
          originalAt: Date.now(),
        },
      ],
    }),
  ).rejects.toThrow(/designated offline station/);

  await t.mutation(api.agcOffline.registerStation, {
    sessionToken: approver.token,
    building: "Blocks 1–4",
    stationName: "Block 1 laptop",
  });

  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 2,
  });
  const room = await seedRoom(t, { accommodationType: "hostel", name: "Room O1", capacity: 4 });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRoomAssignments", {
      roomId: room as Id<"agcRooms">,
      guestId: booking.guestIds[0] as Id<"agcGuests">,
      bookingId: booking.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });

  const queued = await t.mutation(api.agcOffline.queueTransactions, {
    sessionToken: staff.token,
    building: "Blocks 1–4",
    stationName: "Block 1 laptop",
    transactions: [
      {
        txId: "tx-1",
        staffId: "checkin@example.com",
        staffRole: "checkin",
        action: "check_in",
        payload: JSON.stringify({
          guestId: booking.guestIds[0],
          location: "Blocks 1–4",
        }),
        originalAt: Date.now() - 1000,
      },
    ],
  });
  expect(queued.duplicates).toBe(0);
  expect(queued.stored).toBe(1);

  // Re-queue the same tx → deduped, nothing new stored (§19).
  const requeue = await t.mutation(api.agcOffline.queueTransactions, {
    sessionToken: staff.token,
    building: "Blocks 1–4",
    stationName: "Block 1 laptop",
    transactions: [
      {
        txId: "tx-1",
        staffId: "checkin@example.com",
        staffRole: "checkin",
        action: "check_in",
        payload: JSON.stringify({
          guestId: booking.guestIds[0],
          location: "Blocks 1–4",
        }),
        originalAt: Date.now() - 1000,
      },
    ],
  });
  expect(requeue.stored).toBe(0);
  expect(requeue.duplicates).toBe(1);

  // Sync applies the queued check-in.
  const synced = await t.mutation(api.agcOffline.syncPendingTransactions, {
    sessionToken: approver.token,
    building: "Blocks 1–4",
  });
  expect(synced.applied).toBe(1);
  const overview = await t.query(api.agcCheckin.getArrivalOverview, {
    sessionToken: approver.token,
  });
  expect(overview.checkedIn).toBe(1);

  // Conflicting queued transactions (duplicate check-in content) are flagged,
  // never silently applied (§19).
  await t.mutation(api.agcOffline.queueTransactions, {
    sessionToken: staff.token,
    building: "Blocks 1–4",
    stationName: "Block 1 laptop",
    transactions: [
      {
        txId: "tx-2",
        staffId: "checkin@example.com",
        staffRole: "checkin",
        action: "check_in",
        payload: JSON.stringify({
          guestId: booking.guestIds[0],
          location: "Blocks 1–4",
        }),
        originalAt: Date.now(),
      },
    ],
  });
  const secondSync = await t.mutation(api.agcOffline.syncPendingTransactions, {
    sessionToken: approver.token,
    building: "Blocks 1–4",
  });
  expect(secondSync.conflicts).toBe(1);
  expect(secondSync.applied).toBe(0);

  // An approver can resolve the conflict.
  const conflicts = await t.query(api.agcOffline.listConflicts, {
    sessionToken: approver.token,
  });
  const conflictTx = conflicts.find((row) => row.txId === "tx-2");
  expect(conflictTx).toBeTruthy();
  await t.mutation(api.agcOffline.resolveConflict, {
    sessionToken: approver.token,
    transactionId: conflictTx!._id as Id<"agcOfflineTransactions">,
    resolution: "rejected",
    note: "Duplicate of desk action",
  });
  const status = await t.query(api.agcOffline.getStationStatus, {
    sessionToken: staff.token,
    building: "Blocks 1–4",
  });
  expect(status.conflicts).toBe(0);
  expect(status.lastSuccessfulSync).not.toBeNull();
});

test("group check-in: only individually ticked delegates are checked in (§13)", async () => {
  const t = createTestConvex();
  const seed = await seedStaff(t, "checkin");
  const approver = await seedStaff(t, "accommodation");

  // One hub, three assigned dormitory guests (wristband — no keys involved).
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "dormitory",
    gender: "male",
    count: 3,
  });
  const room = await seedRoom(t, {
    accommodationType: "dormitory",
    name: "Dorm Hall A",
    capacity: 6,
  });
  await t.run(async (ctx) => {
    for (const guestId of booking.guestIds) {
      await ctx.db.insert("agcRoomAssignments", {
        roomId: room as Id<"agcRooms">,
        guestId: guestId as Id<"agcGuests">,
        bookingId: booking.bookingId,
        assignedBy: "seed",
        createdAt: Date.now(),
      });
    }
  });

  // Empty selection is refused — unticked delegates must never be coerced in.
  await expect(() =>
    t.mutation(api.agcCheckin.checkInGroup, {
      sessionToken: seed.token,
      location: "central",
      arrivals: [],
    }),
  ).rejects.toThrow(/No delegates were ticked/);

  // Staff tick only two of the three people they saw at the desk.
  const result = await t.mutation(api.agcCheckin.checkInGroup, {
    sessionToken: seed.token,
    location: "central",
    arrivals: [
      { guestId: booking.guestIds[0] as Id<"agcGuests"> },
      { guestId: booking.guestIds[1] as Id<"agcGuests"> },
    ],
  });
  expect(result.checkedInCount).toBe(2);
  expect(result.results.map((r) => r.status)).toEqual(["checked_in", "checked_in"]);

  // The unticked third delegate is NOT automatically checked in (§13).
  const overview = await t.query(api.agcCheckin.getArrivalOverview, {
    sessionToken: seed.token,
  });
  expect(overview.checkedIn).toBe(2);
  expect(overview.notArrived).toBe(
    1,
  ); // just the unticked delegate for this booking

  // A repeat tick is reported as a per-delegate rejection, not a crash.
  const retry = await t.mutation(api.agcCheckin.checkInGroup, {
    sessionToken: seed.token,
    location: "central",
    arrivals: [
      { guestId: booking.guestIds[0] as Id<"agcGuests"> },
      { guestId: booking.guestIds[2] as Id<"agcGuests"> },
    ],
  });
  expect(retry.rejectedCount).toBe(1);
  expect(retry.checkedInCount).toBe(1);
  expect(retry.results[0].status).toBe("rejected");
  expect(retry.results[0].reason).toMatch(/ALREADY CHECKED IN/);
  expect(retry.results[1].status).toBe("checked_in");

  // Mixed-hub ticks are refused (§13 requires one hub / arrival group).
  const otherBooking = await seedConfirmedBooking(t, {
    accommodationType: "dormitory",
    gender: "male",
    count: 1,
  });
  await expect(() =>
    t.mutation(api.agcCheckin.checkInGroup, {
      sessionToken: seed.token,
      location: "central",
      arrivals: [
        { guestId: booking.guestIds[0] as Id<"agcGuests"> },
        { guestId: otherBooking.guestIds[0] as Id<"agcGuests"> },
      ],
    }),
  ).rejects.toThrow(/one hub or arrival group/);

  // Ordinary (approver) endpoints remain per-delegate: payment rules unchanged
  // inside a group batch are enforced by the same core check-in (§18).
  const financeSeed = await seedStaff(t, "finance");
  await expect(() =>
    t.mutation(api.agcCheckin.checkInGroup, {
      sessionToken: financeSeed.token,
      location: "central",
      arrivals: [{ guestId: booking.guestIds[2] as Id<"agcGuests"> }],
    }),
  ).rejects.toThrow(/Unauthorized/);

  // Approver still only counts what it ticked — nothing auto-arrives.
  const after = await t.query(api.agcCheckin.getArrivalOverview, {
    sessionToken: approver.token,
  });
  expect(after.checkedIn).toBe(3);
});

test("flag this record for review: a note is required, and only the admin clears it", async () => {
  const t = createTestConvex();
  const desk = await seedStaff(t, "checkin");
  const admin = await seedStaff(t, "admin");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 1,
  });
  const guestId = booking.guestIds[0] as Id<"agcGuests">;
  const room = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Flag Room",
    capacity: 2,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRoomAssignments", {
      roomId: room as Id<"agcRooms">,
      guestId,
      bookingId: booking.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });

  // The note is the reason — an empty one is refused.
  await expect(() =>
    t.mutation(api.agcCheckin.flagCheckInRecord, {
      sessionToken: desk.token,
      guestId,
      note: "   ",
    }),
  ).rejects.toThrow(/note is required/);

  const flagged = await t.mutation(api.agcCheckin.flagCheckInRecord, {
    sessionToken: desk.token,
    guestId,
    note: "Receipt does not match the booking",
  });
  expect(flagged.flagId).toBeTruthy();

  // The desk sheet and the search both carry the flag with its note.
  const sheet = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: desk.token,
  });
  const sheetRow = sheet.find((row) => row.guestId === guestId);
  expect(sheetRow?.reviewFlag?.note).toBe("Receipt does not match the booking");
  expect(sheetRow?.reviewFlag?.raisedBy).toBe("checkin@example.com");
  const searched = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: desk.token,
    search: "Guest0",
  });
  expect(searched.find((row) => row.guestId === guestId)?.reviewFlag?._id).toBe(
    flagged.flagId,
  );

  // A second flag on the same record is refused with the open reason.
  await expect(() =>
    t.mutation(api.agcCheckin.flagCheckInRecord, {
      sessionToken: desk.token,
      guestId,
      note: "Again",
    }),
  ).rejects.toThrow(/ALREADY FLAGGED/);

  // A flag asks for a second look; it never blocks the desk.
  const checkIn = await t.mutation(api.agcCheckin.checkInGuest, {
    sessionToken: desk.token,
    guestId,
    location: "central",
  });
  expect(checkIn.checkInId).toBeTruthy();

  let overview = await t.query(api.agcCheckin.getArrivalOverview, {
    sessionToken: admin.token,
  });
  expect(overview.reviewFlags).toBe(1);

  // Clearing it is an Accommodation Admin decision, and needs its own note.
  await expect(() =>
    t.mutation(api.agcCheckin.resolveCheckinFlag, {
      sessionToken: desk.token,
      flagId: flagged.flagId,
      resolutionNote: "Checked at the desk",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(() =>
    t.mutation(api.agcCheckin.resolveCheckinFlag, {
      sessionToken: admin.token,
      flagId: flagged.flagId,
      resolutionNote: "  ",
    }),
  ).rejects.toThrow(/note is required/);

  await t.mutation(api.agcCheckin.resolveCheckinFlag, {
    sessionToken: admin.token,
    flagId: flagged.flagId,
    resolutionNote: "Receipt verified against the transfer",
  });

  overview = await t.query(api.agcCheckin.getArrivalOverview, {
    sessionToken: admin.token,
  });
  expect(overview.reviewFlags).toBe(0);
  const cleared = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: desk.token,
  });
  expect(cleared.find((row) => row.guestId === guestId)?.reviewFlag).toBeNull();

  // The closed flag stays in the record and cannot be closed twice.
  const stored = await t.run(async (ctx) => await ctx.db.get(flagged.flagId));
  expect(stored?.resolutionNote).toBe("Receipt verified against the transfer");
  expect(stored?.note).toBe("Receipt does not match the booking");
  await expect(() =>
    t.mutation(api.agcCheckin.resolveCheckinFlag, {
      sessionToken: admin.token,
      flagId: flagged.flagId,
      resolutionNote: "Again",
    }),
  ).rejects.toThrow(/already closed/);
});

test("the review queue lists every open flag for the admin, newest first", async () => {
  const t = createTestConvex();
  const desk = await seedStaff(t, "checkin");
  const admin = await seedStaff(t, "accommodation");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "female",
    count: 2,
  });
  const [firstGuest, secondGuest] = booking.guestIds as Id<"agcGuests">[];
  const room = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Queue Room",
    building: "Block B",
    capacity: 2,
  });
  await t.run(async (ctx) => {
    for (const guestId of [firstGuest, secondGuest]) {
      await ctx.db.insert("agcRoomAssignments", {
        roomId: room as Id<"agcRooms">,
        guestId,
        bookingId: booking.bookingId,
        assignedBy: "seed",
        createdAt: Date.now(),
      });
    }
  });

  const first = await t.mutation(api.agcCheckin.flagCheckInRecord, {
    sessionToken: desk.token,
    guestId: firstGuest,
    note: "ID does not match the booking name",
  });
  const second = await t.mutation(api.agcCheckin.flagCheckInRecord, {
    sessionToken: desk.token,
    guestId: secondGuest,
    note: "Room was double-let at the desk",
  });
  // Fixed timestamps so the newest-first order is deterministic.
  await t.run(async (ctx) => {
    await ctx.db.patch(first.flagId, { raisedAt: 1_000 });
    await ctx.db.patch(second.flagId, { raisedAt: 2_000 });
  });

  const queue = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  expect(queue).toHaveLength(2);
  expect(queue.map((row) => row.guestId)).toEqual([secondGuest, firstGuest]);
  // Each row carries enough of the record to decide without opening the desk.
  expect(queue[0].note).toBe("Room was double-let at the desk");
  expect(queue[0].guestName).toBe("Member Guest1 Mensah");
  expect(queue[0].gender).toBe("female");
  expect(queue[0].hubName).toBe("Test Hub");
  expect(queue[0].roomName).toBe("Queue Room");
  expect(queue[0].building).toBe("Block B");
  expect(queue[0].bookingRef).toBe("AGC-BK-0001");
  expect(queue[0].accommodationType).toBe("hostel");
  expect(queue[0].paymentStatus).toBe("confirmed");
  expect(queue[0].checkInStatus).toBe("not_arrived");
  expect(queue[0].raisedBy).toBe("checkin@example.com");
  expect(queue[0].raisedByRole).toBe("checkin");

  // The queue is the reviewer's screen — the desk cannot read it.
  await expect(() =>
    t.query(api.agcCheckin.listReviewFlags, { sessionToken: desk.token }),
  ).rejects.toThrow(/Unauthorized/);

  // Working a record takes it off the queue; the other one stays.
  await t.mutation(api.agcCheckin.resolveCheckinFlag, {
    sessionToken: admin.token,
    flagId: queue[0]._id as Id<"agcCheckinFlags">,
    resolutionNote: "Re-let the bed, the second delegate moved to B-12",
  });
  const after = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  expect(after.map((row) => row.guestId)).toEqual([firstGuest]);
});
test("the reviewer beds a delegate and pre-authorizes the override from the queue", async () => {
  const t = createTestConvex();
  const desk = await seedStaff(t, "checkin");
  const admin = await seedStaff(t, "accommodation");

  // 1. A bed from the queue — a confirmed delegate who has no room yet.
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 1,
  });
  const guestId = booking.guestIds[0] as Id<"agcGuests">;
  const maleRoom = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Block 4 Room 12",
    building: "Block 4",
    capacity: 2,
  });
  // A room locked to women must not be offered to this male delegate.
  await seedRoom(t, {
    accommodationType: "hostel",
    name: "Block 4 Room 13",
    building: "Block 4",
    capacity: 2,
    gender: "female",
  });
  const bedFlag = await t.mutation(api.agcCheckin.flagCheckInRecord, {
    sessionToken: desk.token,
    guestId,
    note: "Arrived without a bed",
  });

  let queue = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  expect(queue).toHaveLength(1);
  expect(queue[0].assignmentStatus).toBe("unassigned");
  expect(queue[0].roomable).toBe(true);
  expect(queue[0].bookingLive).toBe(true);
  expect(queue[0].paymentOverride).toBeNull();

  // The rooms the reviewer may pick from: same type, a free bed, and no gender
  // lock against the delegate (the server still owns the shared-room rule).
  const roomRows = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: admin.token,
  });
  const pickable = roomRows.filter(
    (room) =>
      room.accommodationType === "hostel" &&
      room.capacity - room.occupants > 0 &&
      (!room.gender || room.gender === "male"),
  );
  expect(pickable.map((room) => room.name)).toEqual(["Block 4 Room 12"]);

  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: admin.token,
    roomId: maleRoom as Id<"agcRooms">,
    guestIds: [guestId],
  });
  queue = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  expect(queue[0].assignmentStatus).toBe("assigned");
  expect(queue[0].roomName).toBe("Block 4 Room 12");
  expect(queue[0].building).toBe("Block 4");
  // Bedding the delegate is not the review decision — the flag stays open.
  expect(queue[0].note).toBe("Arrived without a bed");
  expect(queue[0].paymentOverride).toBeNull();

  // An override is for unconfirmed payments only.
  await expect(() =>
    t.mutation(api.agcCheckin.authorizeCheckinOverride, {
      sessionToken: admin.token,
      flagId: bedFlag.flagId,
      reason: "Not needed here",
    }),
  ).rejects.toThrow(/payment is in order/);

  // 2. The override — a delegate whose receipt the desk could not verify.
  const unpaid = await seedConfirmedBooking(t, {
    accommodationType: "dormitory",
    gender: "male",
    count: 1,
  });
  const unpaidGuest = unpaid.guestIds[0] as Id<"agcGuests">;
  const dorm = await seedRoom(t, {
    accommodationType: "dormitory",
    name: "Dorm A",
    capacity: 4,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(unpaid.bookingId, {
      paymentStatus: "pending_verification",
      bookingStatus: "pending_verification",
    });
    await ctx.db.insert("agcRoomAssignments", {
      roomId: dorm as Id<"agcRooms">,
      guestId: unpaidGuest,
      bookingId: unpaid.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });
  const flag = await t.mutation(api.agcCheckin.flagCheckInRecord, {
    sessionToken: desk.token,
    guestId: unpaidGuest,
    note: "Receipt not verified",
  });

  // The desk cannot check the delegate in on unconfirmed payment (§18).
  await expect(() =>
    t.mutation(api.agcCheckin.checkInGuest, {
      sessionToken: desk.token,
      guestId: unpaidGuest,
      location: "central",
    }),
  ).rejects.toThrow(/Payment not confirmed/);

  // Authorizing it is an Accommodation Admin decision, and the reason is the
  // record of why the debt was let through.
  await expect(() =>
    t.mutation(api.agcCheckin.authorizeCheckinOverride, {
      sessionToken: desk.token,
      flagId: flag.flagId,
      reason: "Receipt verified",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(() =>
    t.mutation(api.agcCheckin.authorizeCheckinOverride, {
      sessionToken: admin.token,
      flagId: flag.flagId,
      reason: "   ",
    }),
  ).rejects.toThrow(/reason is required/);

  await t.mutation(api.agcCheckin.authorizeCheckinOverride, {
    sessionToken: admin.token,
    flagId: flag.flagId,
    reason: "Receipt verified against the transfer",
  });
  await expect(() =>
    t.mutation(api.agcCheckin.authorizeCheckinOverride, {
      sessionToken: admin.token,
      flagId: flag.flagId,
      reason: "Again",
    }),
  ).rejects.toThrow(/already authorized/);

  const withOverride = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  const unpaidRow = withOverride.find((row) => row.guestId === unpaidGuest);
  expect(unpaidRow?.roomable).toBe(false);
  expect(unpaidRow?.bookingLive).toBe(true);
  expect(unpaidRow?.paymentOverride?.authorizedBy).toBe("accommodation@example.com");
  expect(unpaidRow?.paymentOverride?.reason).toBe(
    "Receipt verified against the transfer",
  );

  // The desk's own row carries it, so the counter knows the override is in
  // place and does not need an approver to type one in.
  const searched = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: desk.token,
    search: "Guest0",
  });
  expect(
    searched.find((row) => row.guestId === unpaidGuest)?.reviewFlag
      ?.overrideAuthorizedBy,
  ).toBe("accommodation@example.com");

  // The desk finishes the arrival; the check-in records the authorizer.
  const checkIn = await t.mutation(api.agcCheckin.checkInGuest, {
    sessionToken: desk.token,
    guestId: unpaidGuest,
    location: "central",
  });
  const stored = await t.run(async (ctx) => await ctx.db.get(checkIn.checkInId));
  expect(stored?.paymentOverride?.authorizedBy).toBe("accommodation@example.com");
  expect(stored?.paymentOverride?.reason).toBe(
    "Receipt verified against the transfer",
  );
  expect(stored?.checkedInBy).toBe("checkin@example.com");

  const overview = await t.query(api.agcCheckin.getArrivalOverview, {
    sessionToken: admin.token,
  });
  expect(overview.paymentOverrides).toBe(1);
  const audit = await t.run(async (ctx) =>
    (await ctx.db.query("auditLogs").collect()).filter(
      (log) => log.action === "agc_checkin.override_approved",
    ),
  );
  expect(audit[0].summary).toContain(
    "pre-authorized by accommodation@example.com",
  );
});

test("the accommodation team corrects a delegate's name and gender, but never into an invalid room", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");
  const accommodation = await seedStaff(t, "accommodation");
  const desk = await seedStaff(t, "checkin");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 2,
  });
  const [firstGuest, secondGuest] = booking.guestIds as Id<"agcGuests">[];
  const room = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Block 4 Room 12",
    capacity: 2,
  });
  await t.run(async (ctx) => {
    for (const guestId of [firstGuest, secondGuest]) {
      await ctx.db.insert("agcRoomAssignments", {
        roomId: room as Id<"agcRooms">,
        guestId,
        bookingId: booking.bookingId,
        assignedBy: "seed",
        createdAt: Date.now(),
      });
    }
  });

  // Correcting a confirmed reservation sits with the accommodation team, so the
  // ordinary desk staff who find the wrong name cannot rewrite it themselves —
  // and the reason and the names are both required.
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: desk.token,
      guestId: firstGuest,
      firstName: "Kofi",
      lastName: "Boateng",
      gender: "male",
      reason: "Substituted on arrival",
    }),
  ).rejects.toThrow(/Unauthorized/);
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: admin.token,
      guestId: firstGuest,
      firstName: "Kofi",
      lastName: "Boateng",
      gender: "male",
      reason: "   ",
    }),
  ).rejects.toThrow(/reason is required/);
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: admin.token,
      guestId: firstGuest,
      firstName: "   ",
      lastName: "Boateng",
      gender: "male",
      reason: "Typo",
    }),
  ).rejects.toThrow(/name/);
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: admin.token,
      guestId: firstGuest,
      firstName: "Guest0",
      lastName: "Mensah",
      gender: "male",
      reason: "No change",
    }),
  ).rejects.toThrow(/already on the booking/);

  // A name-only correction goes through: the type never changes (§43), the
  // title survives, and the previous details are kept.
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: admin.token,
    guestId: firstGuest,
    firstName: "Kofi",
    lastName: "Boateng",
    gender: "male",
    reason: "Original delegate could not travel",
  });
  let stored = await t.run(async (ctx) => await ctx.db.get(firstGuest));
  expect(stored?.firstName).toBe("Kofi");
  expect(stored?.lastName).toBe("Boateng");
  expect(stored?.title).toBe("Member");
  expect(stored?.accommodationType).toBe("hostel");
  expect(stored?.status).toBe("active");
  let history = await t.run(async (ctx) =>
    await ctx.db
      .query("agcSubstitutions")
      .withIndex("by_guest", (q) => q.eq("guestId", firstGuest))
      .collect(),
  );
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    previousFirstName: "Guest0",
    previousLastName: "Mensah",
    newFirstName: "Kofi",
    newLastName: "Boateng",
    overrideByAdmin: true,
    actorAdminEmail: "admin@example.com",
    reason: "Original delegate could not travel",
  });

  // The room is single-gender, so the delegate cannot become female while a
  // male delegate shares it (Phase 2 §4).
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: admin.token,
      guestId: firstGuest,
      firstName: "Kofi",
      lastName: "Boateng",
      gender: "female",
      reason: "Gender recorded in error",
    }),
  ).rejects.toThrow(/single-gender/);

  // With the other bed vacated the correction is allowed, and the gender the
  // rooming list reads is the corrected one.
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("agcRoomAssignments")
      .withIndex("by_guest", (q) => q.eq("guestId", secondGuest))
      .collect();
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        endedAt: Date.now(),
        endBy: "seed",
        endReason: "Moved for the test",
      });
    }
  });
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: admin.token,
    guestId: firstGuest,
    firstName: "Kofi",
    lastName: "Boateng",
    gender: "female",
    reason: "Gender recorded in error",
  });
  stored = await t.run(async (ctx) => await ctx.db.get(firstGuest));
  expect(stored?.gender).toBe("female");
  history = await t.run(async (ctx) =>
    await ctx.db
      .query("agcSubstitutions")
      .withIndex("by_guest", (q) => q.eq("guestId", firstGuest))
      .collect(),
  );
  expect(history).toHaveLength(2);
  expect(
    history.some(
      (row) => row.previousGender === "male" && row.newGender === "female",
    ),
  ).toBe(true);

  // A room locked to one gender is the other half of the rule.
  const locked = await seedRoom(t, {
    accommodationType: "hostel",
    name: "Block 5 Room 2",
    capacity: 2,
    gender: "male",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRoomAssignments", {
      roomId: locked as Id<"agcRooms">,
      guestId: secondGuest,
      bookingId: booking.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: admin.token,
      guestId: secondGuest,
      firstName: "Guest1",
      lastName: "Mensah",
      gender: "female",
      reason: "Gender recorded in error",
    }),
  ).rejects.toThrow(/reserved for male guests/);

  // Every correction is in the audit trail.
  const audit = await t.run(async (ctx) =>
    (await ctx.db.query("auditLogs").collect()).filter(
      (log) => log.action === "agc_guest.corrected",
    ),
  );
  expect(audit).toHaveLength(2);
  expect(audit[0].actorEmail).toBe("admin@example.com");
  expect(audit[0].summary).toContain("Kofi Boateng");

  // The Accommodation Admin holds the same power — they work the flagged-record
  // queue, and a wrong name is usually what the desk flagged in the first place
  // — and the change is attributed to them, not to the admin who did not make
  // it.
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: accommodation.token,
    guestId: secondGuest,
    firstName: "Kwesi",
    lastName: "Mensah",
    gender: "male",
    reason: "Name recorded incorrectly at registration",
  });
  const accommodationAudit = await t.run(async (ctx) =>
    (await ctx.db.query("auditLogs").collect()).filter(
      (log) => log.action === "agc_guest.corrected",
    ),
  );
  expect(accommodationAudit).toHaveLength(3);
  expect(accommodationAudit[2].actorEmail).toBe("accommodation@example.com");
  const accommodationHistory = await t.run(async (ctx) =>
    await ctx.db
      .query("agcSubstitutions")
      .withIndex("by_guest", (q) => q.eq("guestId", secondGuest))
      .collect(),
  );
  expect(accommodationHistory).toHaveLength(1);
  expect(accommodationHistory[0]).toMatchObject({
    previousFirstName: "Guest1",
    newFirstName: "Kwesi",
    actorAdminEmail: "accommodation@example.com",
    reason: "Name recorded incorrectly at registration",
  });
});
test("the desk row carries the delegate's name parts so a super admin can correct them where they are found", async () => {
  const t = createTestConvex();
  const desk = await seedStaff(t, "checkin");
  const admin = await seedStaff(t, "admin");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 1,
  });
  const guestId = booking.guestIds[0] as Id<"agcGuests">;

  // The desk sheet and the search both carry the parts of the name, not just the
  // joined label, so the correction form opens pre-filled with what is on file
  // instead of asking staff to retype a name they are trying to fix.
  const sheet = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: desk.token,
  });
  const sheetRow = sheet.find((row) => row.guestId === guestId);
  expect(sheetRow?.title).toBe("Member");
  expect(sheetRow?.firstName).toBe("Guest0");
  expect(sheetRow?.lastName).toBe("Mensah");
  expect(sheetRow?.name).toContain("Guest0");
  const searched = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: desk.token,
    search: "Guest0",
  });
  expect(searched[0]).toMatchObject({
    title: "Member",
    firstName: "Guest0",
    lastName: "Mensah",
  });

  // The desk can raise the correction, but making it is the accommodation
  // team's decision — the counter staff cannot rewrite a record on their own.
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: desk.token,
      guestId,
      firstName: "Ama",
      lastName: "Boateng",
      gender: "female",
      reason: "Substituted on arrival",
    }),
  ).rejects.toThrow(/Unauthorized/);

  // Corrected where the desk found it: the counter keeps looking at the same
  // delegate and now sees the name and gender that actually arrived.
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: admin.token,
    guestId,
    firstName: "Ama",
    lastName: "Boateng",
    gender: "female",
    reason: "Substituted on arrival",
  });
  const after = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: desk.token,
  });
  const afterRow = after.find((row) => row.guestId === guestId);
  expect(afterRow?.firstName).toBe("Ama");
  expect(afterRow?.lastName).toBe("Boateng");
  expect(afterRow?.gender).toBe("female");
  expect(afterRow?.name).toContain("Ama");
  expect(afterRow?.name).not.toContain("Guest0");

  // The desk-driven correction is recorded like any other, so the reviewer can
  // see who changed the record and why.
  const audit = await t.run(async (ctx) =>
    (await ctx.db.query("auditLogs").collect()).filter(
      (log) => log.action === "agc_guest.corrected",
    ),
  );
  expect(audit).toHaveLength(1);
  expect(audit[0].actorEmail).toBe("admin@example.com");
  expect(audit[0].summary).toContain("reason: Substituted on arrival");
});
test("the reviewer corrects a flagged delegate's details from the queue, and the room filter follows", async () => {
  const t = createTestConvex();
  const desk = await seedStaff(t, "checkin");
  const admin = await seedStaff(t, "admin");
  const accommodation = await seedStaff(t, "accommodation");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 1,
  });
  const guestId = booking.guestIds[0] as Id<"agcGuests">;
  const flag = await t.mutation(api.agcCheckin.flagCheckInRecord, {
    sessionToken: desk.token,
    guestId,
    note: "Name does not match the ID presented",
  });

  // The queue row carries the parts of the name, not just the joined label, so
  // the correction opens pre-filled with what is on file.
  let queue = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({
    title: "Member",
    firstName: "Guest0",
    lastName: "Mensah",
    gender: "male",
  });

  // The desk raises the flag but does not rewrite the record; the Accommodation
  // Admin who owns this queue can correct it without waiting on a super admin.
  await expect(() =>
    t.mutation(api.agcAdminData.correctBookingGuest, {
      sessionToken: desk.token,
      guestId,
      firstName: "Ama",
      lastName: "Boateng",
      gender: "female",
      reason: "Arrived as somebody else",
    }),
  ).rejects.toThrow(/Unauthorized/);

  // Corrected from the list, next to the room and override actions, by the
  // reviewer the queue belongs to: it re-reads with the new details.
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: accommodation.token,
    guestId,
    firstName: "Ama",
    lastName: "Boateng",
    gender: "female",
    reason: "Arrived as somebody else",
  });
  queue = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  expect(queue[0]).toMatchObject({
    title: "Member",
    firstName: "Ama",
    lastName: "Boateng",
    gender: "female",
  });
  expect(queue[0].guestName).toContain("Ama Boateng");
  expect(queue[0].guestName).not.toContain("Guest0");

  // The correction is not the review decision: the flag stays open with the
  // desk's note until the reviewer clears it.
  expect(queue[0]._id).toBe(flag.flagId);
  expect(queue[0].note).toBe("Name does not match the ID presented");

  // The room filter the reviewer applies next follows the corrected gender —
  // the bed offered is a women's one now, not the men's room.
  await seedRoom(t, {
    accommodationType: "hostel",
    name: "Block 4 Room 12",
    capacity: 2,
    gender: "male",
  });
  await seedRoom(t, {
    accommodationType: "hostel",
    name: "Block 4 Room 13",
    capacity: 2,
    gender: "female",
  });
  const roomRows = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: admin.token,
  });
  const pickable = roomRows.filter(
    (room) =>
      room.accommodationType === "hostel" &&
      room.capacity - room.occupants > 0 &&
      (!room.gender || room.gender === queue[0].gender),
  );
  expect(pickable.map((room) => room.name)).toEqual(["Block 4 Room 13"]);

  // A flag whose delegate has gone from the file has nothing to correct, so the
  // queue offers no form rather than an empty one.
  const other = await seedConfirmedBooking(t, {
    accommodationType: "dormitory",
    gender: "female",
    count: 1,
  });
  const gone = other.guestIds[0] as Id<"agcGuests">;
  await t.mutation(api.agcCheckin.flagCheckInRecord, {
    sessionToken: desk.token,
    guestId: gone,
    note: "ID not checked",
  });
  await t.run(async (ctx) => {
    await ctx.db.delete(gone);
  });
  const after = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: admin.token,
  });
  const goneRow = after.find((row) => row.guestId === gone);
  expect(goneRow?.guestName).toBe("(delegate no longer on file)");
  expect(goneRow?.firstName).toBe("");
  expect(goneRow?.lastName).toBe("");

  // The queue's own correction is audited with the reviewer and the reason.
  const audit = await t.run(async (ctx) =>
    (await ctx.db.query("auditLogs").collect()).filter(
      (log) => log.action === "agc_guest.corrected",
    ),
  );
  expect(audit).toHaveLength(1);
  expect(audit[0].actorEmail).toBe("accommodation@example.com");
  expect(audit[0].summary).toContain("reason: Arrived as somebody else");
});
test("the audit area lists console delegate corrections with who made them and why", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");
  const accommodation = await seedStaff(t, "accommodation");
  const desk = await seedStaff(t, "checkin");
  const booking = await seedConfirmedBooking(t, {
    accommodationType: "hostel",
    gender: "male",
    count: 2,
  });
  const [firstGuest, secondGuest] = booking.guestIds as Id<"agcGuests">[];

  // A rep's own substitution, made while the booking was still theirs to change,
  // is not a console correction — no acting staff member on the row — so it must
  // not appear on the audit screen.
  await t.run(async (ctx) => {
    await ctx.db.insert("agcSubstitutions", {
      bookingId: booking.bookingId,
      guestId: secondGuest,
      previousFirstName: "Guest1",
      previousLastName: "Mensah",
      previousGender: "male",
      previousType: "hostel",
      newFirstName: "Yaw",
      newLastName: "Mensah",
      newGender: "male",
      newType: "hostel",
      overrideByAdmin: false,
      actorRepId: booking.repId,
      reason: "Delegate swapped before the deadline",
      createdAt: 500,
    });
  });

  // Nothing to review yet, and that is an empty list rather than an error.
  let result = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
  });
  expect(result.rows).toEqual([]);
  expect(result.total).toBe(0);
  expect(result.actors).toEqual([]);

  // Two corrections on a locked reservation: the super admin's and the
  // Accommodation Admin's. Both are the set this screen exists to show.
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: admin.token,
    guestId: firstGuest,
    firstName: "Kofi",
    lastName: "Boateng",
    gender: "male",
    reason: "Original delegate could not travel",
  });
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: accommodation.token,
    guestId: secondGuest,
    firstName: "Ama",
    lastName: "Boateng",
    gender: "female",
    reason: "Gender recorded in error at registration",
  });

  result = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
  });
  expect(result.total).toBe(2);
  expect(result.rows).toHaveLength(2);
  // The filter offers the people who have actually made a correction, with how
  // many each of them made and the team they belong to.
  expect(result.actors.map((actor) => actor.email).sort()).toEqual([
    "accommodation@example.com",
    "admin@example.com",
  ]);
  expect(
    result.actors.find((actor) => actor.email === "accommodation@example.com"),
  ).toMatchObject({ role: "accommodation", count: 1 });
  // The team view counts the same corrections by role, so a super admin can ask
  // what one team changed without knowing who works there.
  expect(result.teams).toEqual([
    { role: "accommodation", count: 1 },
    { role: "admin", count: 1 },
  ]);

  // Newest first: pin the two rows to known times so the order does not depend
  // on the millisecond the two mutations happened to land in.
  const adminRow = result.rows.find((row) => row.newFirstName === "Kofi");
  const accommodationRow = result.rows.find((row) => row.newFirstName === "Ama");
  expect(adminRow).toBeTruthy();
  expect(accommodationRow).toBeTruthy();
  await t.run(async (ctx) => {
    await ctx.db.patch(adminRow!._id, { createdAt: 1_000 });
    await ctx.db.patch(accommodationRow!._id, { createdAt: 2_000 });
  });
  result = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
  });
  expect(result.rows.map((row) => row.newFirstName)).toEqual(["Ama", "Kofi"]);

  // Each row says what was replaced, who did it — role included, since that is
  // what tells a super admin which team moved the delegate — and the reason.
  expect(result.rows[0]).toMatchObject({
    previousFirstName: "Guest1",
    previousLastName: "Mensah",
    previousGender: "male",
    newFirstName: "Ama",
    newLastName: "Boateng",
    newGender: "female",
    reason: "Gender recorded in error at registration",
    actorEmail: "accommodation@example.com",
    actorRole: "accommodation",
    bookingRef: "AGC-BK-0001",
  });
  expect(result.rows[1]).toMatchObject({
    previousFirstName: "Guest0",
    newFirstName: "Kofi",
    reason: "Original delegate could not travel",
    actorEmail: "admin@example.com",
    actorRole: "admin",
  });

  // Filtering by team answers "what did Accommodation change?" without naming
  // anyone, and by person keeps the other team's corrections out — while both
  // lists still offer everyone who has one, so the reviewer can widen again
  // without clearing the filter and starting over.
  const byAccommodation = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    actorEmail: "ACCOMMODATION@example.com",
  });
  expect(byAccommodation.rows.map((row) => row.newFirstName)).toEqual(["Ama"]);
  expect(byAccommodation.total).toBe(2);
  expect(byAccommodation.actors).toHaveLength(2);

  const accommodationTeam = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    actorRole: "accommodation",
  });
  expect(accommodationTeam.rows.map((row) => row.newFirstName)).toEqual(["Ama"]);
  const adminTeam = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    actorRole: "admin",
  });
  expect(adminTeam.rows.map((row) => row.newFirstName)).toEqual(["Kofi"]);
  expect(adminTeam.total).toBe(2);
  // A team nobody corrected from is an empty list, not an error.
  const financeTeam = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    actorRole: "finance",
  });
  expect(financeTeam.rows).toEqual([]);
  // Team and person combine: a person outside the team matches nothing.
  const mismatched = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    actorRole: "accommodation",
    actorEmail: "admin@example.com",
  });
  expect(mismatched.rows).toEqual([]);
  expect(mismatched.teams).toHaveLength(2);

  // The date range is inclusive of both days it names, in the viewer's own day
  // boundaries (the panel sends epoch bounds for the picked dates).
  const onTheDay = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    from: 2_000,
    to: 2_000,
  });
  expect(onTheDay.rows.map((row) => row.newFirstName)).toEqual(["Ama"]);
  const afterTheDay = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    from: 2_001,
  });
  expect(afterTheDay.rows).toEqual([]);
  const beforeBoth = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    to: 999,
  });
  expect(beforeBoth.rows).toEqual([]);
  const bothFilters = await t.query(api.admin.listDelegateCorrections, {
    sessionToken: admin.token,
    actorRole: "admin",
    actorEmail: "admin@example.com",
    from: 1_000,
    to: 1_000,
  });
  expect(bothFilters.rows.map((row) => row.newFirstName)).toEqual(["Kofi"]);

  // Reading the corrections is the super admin's view, not the desk's.
  await expect(() =>
    t.query(api.admin.listDelegateCorrections, { sessionToken: desk.token }),
  ).rejects.toThrow(/Unauthorized/);

  // The audit log itself still carries every correction as its own event.
  const audit = await t.run(async (ctx) =>
    (await ctx.db.query("auditLogs").collect()).filter(
      (log) => log.action === "agc_guest.corrected",
    ),
  );
  expect(audit).toHaveLength(2);
});
