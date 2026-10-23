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
