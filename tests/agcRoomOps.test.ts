import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Room operations added on top of Phase 2: the opt-in auto-assign switch,
 * maintenance flags on a physical room, and desk bulk check-in.
 */

type TestConvex = ReturnType<typeof createTestConvex>;
type Role =
  | "admin"
  | "accommodation"
  | "room_assignment"
  | "checkin"
  | "finance"
  | "registration";

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

/** Confirmed booking with `count` delegates of one type and gender. */
async function seedBooking(
  t: TestConvex,
  spec: { count: number; type?: "dormitory" | "hostel"; gender?: "male" | "female" },
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
    for (let i = 0; i < spec.count; i += 1) {
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
    return { hubId, bookingId, guestIds };
  });
}

async function seedRoom(
  t: TestConvex,
  spec: { name: string; capacity: number; type?: "dormitory" | "hostel" },
): Promise<Id<"agcRooms">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("agcRooms", {
      accommodationType: spec.type ?? "dormitory",
      name: spec.name,
      capacity: spec.capacity,
      building: "Blocks 1–4",
    }),
  );
}

async function assign(t: TestConvex, roomId: Id<"agcRooms">, guestIds: Id<"agcGuests">[]) {
  const booking = await t.run(async (ctx) => {
    const guest = await ctx.db.get(guestIds[0]);
    return guest!.bookingId;
  });
  await t.run(async (ctx) => {
    for (const guestId of guestIds) {
      await ctx.db.insert("agcRoomAssignments", {
        roomId,
        guestId,
        bookingId: booking,
        assignedBy: "seed",
        createdAt: Date.now(),
      });
    }
  });
}

test("auto-assign is off until a super admin arms it in settings", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");
  const accommodation = await seedStaff(t, "accommodation");
  const booking = await seedBooking(t, { count: 2 });
  const roomId = await seedRoom(t, { name: "Dorm A", capacity: 2 });

  // Default: the rooms screen is told it is off, and the mutation refuses.
  expect(
    await t.query(api.agcRoomAssignments.getRoomingSettings, {
      sessionToken: accommodation.token,
    }),
  ).toEqual({ autoAssignEnabled: false });
  await expect(() =>
    t.mutation(api.agcRoomAssignments.autoAssignGuests, {
      sessionToken: accommodation.token,
    }),
  ).rejects.toThrow(/turned off/);

  // The accommodation team cannot flip the switch — it is a super-admin call.
  await expect(() =>
    t.mutation(api.agcAdminData.setAutoAssignEnabled, {
      sessionToken: accommodation.token,
      enabled: true,
    }),
  ).rejects.toThrow(/Unauthorized/);

  await t.mutation(api.agcAdminData.setAutoAssignEnabled, {
    sessionToken: admin.token,
    enabled: true,
  });
  expect(
    await t.query(api.agcRoomAssignments.getRoomingSettings, {
      sessionToken: accommodation.token,
    }),
  ).toEqual({ autoAssignEnabled: true });

  const result = await t.mutation(api.agcRoomAssignments.autoAssignGuests, {
    sessionToken: accommodation.token,
  });
  expect(result.placed).toBe(2);
  expect(result.remaining).toBe(0);

  const rooms = await t.query(api.agcRoomAssignments.listRoomsAdmin, {
    sessionToken: accommodation.token,
  });
  expect(rooms.find((room) => room._id === roomId)?.occupants).toBe(2);
  void booking;
});

test("a room flag needs a note, dedupes and is closed by the accommodation team", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");
  const checkin = await seedStaff(t, "checkin");
  const roomId = await seedRoom(t, { name: "Room 214", capacity: 2, type: "hostel" });

  // The detail is the whole point of the flag.
  await expect(() =>
    t.mutation(api.agcRoomIssues.flagRoom, {
      sessionToken: checkin.token,
      roomId,
      category: "toilet",
      note: "   ",
    }),
  ).rejects.toThrow(/Describe the problem/);

  // Desk staff who discover the problem can raise it.
  const first = await t.mutation(api.agcRoomIssues.flagRoom, {
    sessionToken: checkin.token,
    roomId,
    category: "toilet",
    note: "Toilet will not flush",
  });
  expect(first.created).toBe(true);

  // Double-clicking the same report does not open a second flag.
  const again = await t.mutation(api.agcRoomIssues.flagRoom, {
    sessionToken: checkin.token,
    roomId,
    category: "toilet",
    note: "toilet will not flush",
  });
  expect(again.created).toBe(false);
  expect(again.issueId).toBe(first.issueId);

  // A second, different problem is its own row.
  await t.mutation(api.agcRoomIssues.flagRoom, {
    sessionToken: checkin.token,
    roomId,
    category: "water",
    note: "No water from the tap",
  });

  let open = await t.query(api.agcRoomIssues.listRoomIssues, {
    sessionToken: checkin.token,
  });
  expect(open.issues).toHaveLength(2);
  expect(open.openCount).toBe(2);
  expect(open.issues.every((issue) => issue.roomName === "Room 214")).toBe(true);
  expect(open.issues.every((issue) => issue.reportedBy === "checkin@example.com")).toBe(true);

  // The desk reports; only the accommodation team closes.
  await expect(() =>
    t.mutation(api.agcRoomIssues.resolveRoomIssue, {
      sessionToken: checkin.token,
      issueId: first.issueId as Id<"agcRoomIssues">,
    }),
  ).rejects.toThrow(/Unauthorized/);

  const fixed = await t.mutation(api.agcRoomIssues.resolveRoomIssue, {
    sessionToken: admin.token,
    issueId: first.issueId as Id<"agcRoomIssues">,
    resolutionNote: "Plumber replaced the cistern",
  });
  expect(fixed.alreadyFixed).toBe(false);

  open = await t.query(api.agcRoomIssues.listRoomIssues, {
    sessionToken: checkin.token,
  });
  expect(open.issues).toHaveLength(1);
  expect(open.issues[0].category).toBe("water");
  expect(open.openCount).toBe(1);

  // The fixed flag is still on the record for the history view.
  const withHistory = await t.query(api.agcRoomIssues.listRoomIssues, {
    sessionToken: admin.token,
    includeFixed: true,
  });
  const closed = withHistory.issues.find((issue) => issue._id === first.issueId);
  expect(closed?.status).toBe("fixed");
  expect(closed?.resolvedBy).toBe("admin@example.com");
  expect(closed?.resolutionNote).toBe("Plumber replaced the cistern");
});

test("desk bulk check-in checks in the ticked delegates and reports rejections", async () => {
  const t = createTestConvex();
  const staff = await seedStaff(t, "accommodation");
  const ready = await seedBooking(t, { count: 2 });
  const stranded = await seedBooking(t, { count: 1 });
  const roomId = await seedRoom(t, { name: "Dorm B", capacity: 2 });
  await assign(t, roomId, ready.guestIds);

  const result = await t.mutation(api.agcCheckin.checkInBatch, {
    sessionToken: staff.token,
    location: "central",
    guests: [
      { guestId: ready.guestIds[0] },
      { guestId: ready.guestIds[1] },
      // No bed → this one is rejected, but its neighbours still go through.
      { guestId: stranded.guestIds[0] },
    ],
  });
  expect(result.checkedInCount).toBe(2);
  expect(result.rejectedCount).toBe(1);
  expect(
    result.results.find((row) => row.guestId === stranded.guestIds[0])?.reason,
  ).toMatch(/no room assignment/i);

  const desk = await t.query(api.agcCheckin.listArrivalDesk, {
    sessionToken: staff.token,
  });
  const checkedIn = desk.filter((row) => row.checkInStatus === "checked_in");
  expect(checkedIn.map((row) => row.guestId).sort()).toEqual([...ready.guestIds].sort());

  // Re-ticking an already checked-in delegate is refused, not silently repeated.
  const again = await t.mutation(api.agcCheckin.checkInBatch, {
    sessionToken: staff.token,
    location: "central",
    guests: [{ guestId: ready.guestIds[0] }],
  });
  expect(again.checkedInCount).toBe(0);
  expect(again.results[0].reason).toMatch(/ALREADY CHECKED IN/i);

  // An empty tick list is a no-op the desk can understand.
  await expect(() =>
    t.mutation(api.agcCheckin.checkInBatch, {
      sessionToken: staff.token,
      location: "central",
      guests: [],
    }),
  ).rejects.toThrow(/at least one/);

  // Duplicates in one batch are refused up front.
  await expect(() =>
    t.mutation(api.agcCheckin.checkInBatch, {
      sessionToken: staff.token,
      location: "central",
      guests: [{ guestId: stranded.guestIds[0] }, { guestId: stranded.guestIds[0] }],
    }),
  ).rejects.toThrow(/twice/);
});
