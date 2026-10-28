import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * What the room-assignment role can do: it owns the room inventory and works
 * the arrival desk. These tests pin both the powers it now holds and the rules
 * that keep a held or faulty room out of the assignable inventory.
 */

type TestConvex = ReturnType<typeof createTestConvex>;
type Role = "admin" | "accommodation" | "room_assignment" | "checkin";

async function seedStaff(t: TestConvex, role: Role) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      name: role,
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

async function seedBooking(
  t: TestConvex,
  spec: { count?: number; type?: "dormitory" | "hostel"; gender?: "male" | "female" } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const hubId: Id<"agcHubs"> = await ctx.db.insert("agcHubs", {
      name: "Test Hub",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: now,
    });
    const repId: Id<"agcRepresentatives"> = await ctx.db.insert("agcRepresentatives", {
      hubId,
      username: "test_hub",
      passwordHash: "not-a-hash",
      profileComplete: true,
      mustChangePassword: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const bookingId: Id<"agcBookings"> = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 100,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      bookingStatus: "confirmed",
      referenceNumber: "AGC-BK-0001",
      createdAt: now,
      updatedAt: now,
    });
    const guestIds: Id<"agcGuests">[] = [];
    for (let i = 0; i < (spec.count ?? 1); i += 1) {
      guestIds.push(
        await ctx.db.insert("agcGuests", {
          bookingId,
          hubId,
          region: "ghana",
          country: "Ghana",
          firstName: `Guest${i}`,
          lastName: "Mensah",
          gender: spec.gender ?? "male",
          title: "Member",
          accommodationType: spec.type ?? "dormitory",
          pool: "global",
          isBishopRate: false,
          status: "active",
          createdAt: now,
        }),
      );
    }
    return { hubId, repId, bookingId, guestIds };
  });
}

async function seedRoom(
  t: TestConvex,
  spec: { name?: string; capacity?: number } = {},
): Promise<Id<"agcRooms">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: spec.name ?? "Dorm A",
      capacity: spec.capacity ?? 2,
      building: "Blocks 1–4",
    }),
  );
}

test("room-assignment staff hold the room and desk powers", async () => {
  const t = createTestConvex();
  const roomTeam = await seedStaff(t, "room_assignment");
  const checkin = await seedStaff(t, "checkin");
  const booking = await seedBooking(t, { count: 2 });
  const roomId = await seedRoom(t);

  // Inventory: create a room.
  await t.mutation(api.agcRoomAssignments.upsertRoom, {
    sessionToken: roomTeam.token,
    accommodationType: "dormitory",
    name: "Dorm Z",
    capacity: 4,
  });
  const rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: roomTeam.token,
  });
  expect(rooms.some((room) => room.name === "Dorm Z")).toBe(true);

  // Delegate details: name and gender correction, with a reason.
  await t.mutation(api.agcAdminData.correctBookingGuest, {
    sessionToken: roomTeam.token,
    guestId: booking.guestIds[0],
    firstName: "Kofi",
    lastName: "Boateng",
    gender: "female",
    reason: "Substitution — the original delegate could not travel",
  });
  const guests = await t.query(api.agcRoomAssignments.listUnassignedGuestsAdmin, {
    sessionToken: roomTeam.token,
  });
  const corrected = guests.find((guest) => guest._id === booking.guestIds[0]);
  expect(corrected?.name).toContain("Kofi Boateng");
  expect(corrected?.gender).toBe("female");

  // Review queue: read and clear a flag.
  const flagId = await t.run(async (ctx) =>
    ctx.db.insert("agcCheckinFlags", {
      guestId: booking.guestIds[1],
      bookingId: booking.bookingId,
      note: "Looks like the wrong delegate at the counter",
      raisedAt: Date.now(),
      raisedBy: "desk@example.com",
      raisedByRole: "checkin",
    }),
  );
  const queue = await t.query(api.agcCheckin.listReviewFlags, {
    sessionToken: roomTeam.token,
  });
  expect(queue.map((row) => row._id)).toContain(flagId);
  await t.mutation(api.agcCheckin.resolveCheckinFlag, {
    sessionToken: roomTeam.token,
    flagId,
    resolutionNote: "Confirmed with the hub rep — record is correct",
  });

  // The desk still refuses to let check-in staff clear their own flags.
  const secondFlag = await t.run(async (ctx) =>
    ctx.db.insert("agcCheckinFlags", {
      guestId: booking.guestIds[1],
      bookingId: booking.bookingId,
      note: "Second look needed",
      raisedAt: Date.now(),
      raisedBy: "desk@example.com",
      raisedByRole: "checkin",
    }),
  );
  await expect(() =>
    t.mutation(api.agcCheckin.resolveCheckinFlag, {
      sessionToken: checkin.token,
      flagId: secondFlag,
      resolutionNote: "Trying to clear my own flag",
    }),
  ).rejects.toThrow(/Unauthorized/);

  // Undo a check-in.
  await t.run(async (ctx) =>
    ctx.db.insert("agcCheckIns", {
      guestId: booking.guestIds[0],
      bookingId: booking.bookingId,
      hubId: booking.hubId,
      roomId,
      roomName: "Dorm A",
      location: "central",
      checkedInAt: Date.now(),
      checkedInBy: "desk@example.com",
    }),
  );
  const desk = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: roomTeam.token,
  });
  const checkInId = desk.find((row) => row.guestId === booking.guestIds[0])?.checkInId;
  expect(checkInId).toBeTruthy();
  await t.mutation(api.agcCheckin.correctCheckIn, {
    sessionToken: roomTeam.token,
    checkInId: checkInId as Id<"agcCheckIns">,
    reason: "Checked in by mistake — delegate had not arrived",
  });
  const afterCorrection = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: roomTeam.token,
  });
  expect(
    afterCorrection.find((row) => row.guestId === booking.guestIds[0])?.checkInStatus,
  ).toBe("not_arrived");

  // Offline failures: visible and resolvable.
  const txId = await t.run(async (ctx) =>
    ctx.db.insert("agcOfflineTransactions", {
      txId: "tx-1",
      staffId: "station-1",
      building: "Blocks 1–4",
      action: "check_in",
      payload: "{}",
      originalAt: Date.now(),
      syncStatus: "conflict",
      conflictReason: "Delegate already checked in",
      createdAt: Date.now(),
    }),
  );
  const conflicts = await t.query(api.agcOffline.listConflicts, {
    sessionToken: roomTeam.token,
  });
  expect(conflicts.map((row) => row._id)).toContain(txId);
  await t.mutation(api.agcOffline.resolveConflict, {
    sessionToken: roomTeam.token,
    transactionId: txId,
    resolution: "rejected",
    note: "Duplicate of the desk check-in",
  });
  const remaining = await t.query(api.agcOffline.listConflicts, {
    sessionToken: roomTeam.token,
  });
  expect(remaining.map((row) => row._id)).not.toContain(txId);
});

test("a blocking fault takes the room out of inventory until it is fixed", async () => {
  const t = createTestConvex();
  const roomTeam = await seedStaff(t, "room_assignment");
  const booking = await seedBooking(t, { count: 1 });
  const roomId = await seedRoom(t);

  const issue = await t.mutation(api.agcRoomIssues.flagRoom, {
    sessionToken: roomTeam.token,
    roomId,
    category: "toilet",
    note: "Toilet will not flush",
    blocksRoom: true,
  });

  let rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: roomTeam.token,
  });
  expect(rooms.find((room) => room._id === roomId)?.faulty).toBe(true);

  let overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: roomTeam.token,
  });
  expect(overview.faultyRooms).toBe(1);
  expect(overview.availableRooms).toBe(0);

  await expect(() =>
    t.mutation(api.agcRoomAssignments.assignGuests, {
      sessionToken: roomTeam.token,
      roomId,
      guestIds: [booking.guestIds[0]],
    }),
  ).rejects.toThrow(/out of inventory/);

  // Fixing the fault returns the room to service automatically.
  await t.mutation(api.agcRoomIssues.resolveRoomIssue, {
    sessionToken: roomTeam.token,
    issueId: issue.issueId as Id<"agcRoomIssues">,
    resolutionNote: "Plumber replaced the cistern",
  });
  rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: roomTeam.token,
  });
  expect(rooms.find((room) => room._id === roomId)?.faulty).toBe(false);
  overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: roomTeam.token,
  });
  expect(overview.faultyRooms).toBe(0);
  expect(overview.availableRooms).toBe(1);

  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: roomTeam.token,
    roomId,
    guestIds: [booking.guestIds[0]],
  });

  // A non-blocking note is just a note — it never removes the room.
  await t.mutation(api.agcRoomAssignments.upsertRoom, {
    sessionToken: roomTeam.token,
    accommodationType: "dormitory",
    name: "Dorm B",
    capacity: 2,
  });
  const spare = await t.run(async (ctx) => {
    const rows = await ctx.db.query("agcRooms").collect();
    return rows.find((row) => row.name === "Dorm B")!;
  });
  await t.mutation(api.agcRoomIssues.flagRoom, {
    sessionToken: roomTeam.token,
    roomId: spare._id,
    category: "cleaning",
    note: "Needs a sweep",
    blocksRoom: false,
  });
  const stillAssignable = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: roomTeam.token,
  });
  expect(stillAssignable.find((room) => room._id === spare._id)?.faulty).toBe(false);
});

test("reserved rooms are held out of assignment and released on demand", async () => {
  const t = createTestConvex();
  const roomTeam = await seedStaff(t, "room_assignment");
  const booking = await seedBooking(t, { count: 2 });
  const roomId = await seedRoom(t);

  // A note is what tells the next person why the room is held.
  await expect(() =>
    t.mutation(api.agcRoomAssignments.holdRoom, {
      sessionToken: roomTeam.token,
      roomId,
      note: "  ",
    }),
  ).rejects.toThrow(/why the room/);

  await t.mutation(api.agcRoomAssignments.holdRoom, {
    sessionToken: roomTeam.token,
    roomId,
    note: "Held for the bishop's party",
  });
  const held = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: roomTeam.token,
  });
  expect(held.find((room) => room._id === roomId)?.hold?.note).toBe("Held for the bishop's party");

  const overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: roomTeam.token,
  });
  expect(overview.reservedRooms).toBe(1);
  expect(overview.availableBeds).toBe(0);

  await expect(() =>
    t.mutation(api.agcRoomAssignments.assignGuests, {
      sessionToken: roomTeam.token,
      roomId,
      guestIds: [booking.guestIds[0]],
    }),
  ).rejects.toThrow(/reserved/);

  await t.mutation(api.agcRoomAssignments.releaseRoomHold, {
    sessionToken: roomTeam.token,
    roomId,
  });
  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: roomTeam.token,
    roomId,
    guestIds: [booking.guestIds[0]],
  });

  // A room that still holds someone cannot be reserved out from under them.
  await expect(() =>
    t.mutation(api.agcRoomAssignments.holdRoom, {
      sessionToken: roomTeam.token,
      roomId,
      note: "Trying to hold an occupied room",
    }),
  ).rejects.toThrow(/still holds/);
});

test("a last-minute delegate is roomable and check-in ready", async () => {
  const t = createTestConvex();
  const roomTeam = await seedStaff(t, "room_assignment");
  const hub = await seedBooking(t, { count: 0 });
  const roomId = await seedRoom(t);

  // Validation first: names are both required.
  await expect(() =>
    t.mutation(api.agcRoomAssignments.addWalkInDelegate, {
      sessionToken: roomTeam.token,
      hubId: hub.hubId,
      firstName: "Ama",
      lastName: "  ",
      gender: "female",
      accommodationType: "dormitory",
    }),
  ).rejects.toThrow(/both required/);

  const result = await t.mutation(api.agcRoomAssignments.addWalkInDelegate, {
    sessionToken: roomTeam.token,
    hubId: hub.hubId,
    title: "Member",
    firstName: "Ama",
    lastName: "Owusu",
    gender: "female",
    accommodationType: "dormitory",
    note: "Volunteer on the media team",
  });
  expect(result.referenceNumber).toMatch(/^HC\d{5}$/);

  const waiting = await t.query(api.agcRoomAssignments.listUnassignedGuestsAdmin, {
    sessionToken: roomTeam.token,
  });
  const walkIn = waiting.find((guest) => guest._id === result.guestId);
  expect(walkIn?.name).toContain("Ama Owusu");
  expect(walkIn?.hubName).toBe("Test Hub");

  const overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: roomTeam.token,
  });
  expect(overview.awaitingRoom).toBe(1);

  // The walk-in goes through the normal rooming and desk flows.
  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: roomTeam.token,
    roomId,
    guestIds: [result.guestId],
  });
  const batch = await t.mutation(api.agcCheckin.checkInBatch, {
    sessionToken: roomTeam.token,
    location: "central",
    guests: [{ guestId: result.guestId }],
  });
  expect(batch.checkedInCount).toBe(1);

  const desk = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: roomTeam.token,
  });
  expect(desk.find((row) => row.guestId === result.guestId)?.checkInStatus).toBe(
    "checked_in",
  );
});
