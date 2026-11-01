import { expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Beds held by a delegate record that no longer exists.
 *
 * A rep editing or deleting a booking used to erase the guest rows and leave
 * their assignment open. An open row is what the room grid counts, so the bed
 * read as filled forever: rooms showed 2500/2500 while delegates waited, and no
 * amount of assigning could reach those beds. These tests pin both halves of the
 * fix — the audit that names such beds and the release that returns them, and
 * the delete path that no longer creates them.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedStaff(t: TestConvex) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Room desk",
      email: "desk@example.com",
      passwordHash: "not-a-real-hash",
      role: "admin",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });
  return token;
}

async function seedBooking(t: TestConvex, count = 1) {
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
    for (let i = 0; i < count; i += 1) {
      guestIds.push(
        await ctx.db.insert("agcGuests", {
          bookingId,
          hubId,
          region: "ghana",
          country: "Ghana",
          firstName: `Guest${i}`,
          lastName: "Mensah",
          gender: "male",
          title: "Member",
          accommodationType: "dormitory",
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

async function seedRoom(t: TestConvex) {
  return await t.run((ctx) =>
    ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "C5 R1",
      capacity: 2,
      building: "C5",
    }),
  );
}

test("a bed held by a deleted guest is reported, and releasing it frees the room", async () => {
  const t = createTestConvex();
  const token = await seedStaff(t);
  const { guestIds } = await seedBooking(t);
  const roomId = await seedRoom(t);
  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: token,
    roomId,
    guestIds,
  });

  let overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: token,
  });
  expect(overview.occupiedBeds).toBe(1);
  expect(overview.orphanedBeds).toBe(0);
  expect(overview.awaitingRoom).toBe(0);

  // What a rep-side guest deletion used to leave behind.
  await t.run((ctx) => ctx.db.delete(guestIds[0]));

  overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: token,
  });
  // Still counted as occupied, because the row still blocks a bed...
  expect(overview.occupiedBeds).toBe(1);
  // ...but named for what it is, so the desk can see why the room is full.
  expect(overview.orphanedBeds).toBe(1);
  expect(overview.orphanedRooms).toBe(1);

  const released = await t.mutation(api.agcRoomAssignments.releaseOrphanedBeds, {
    sessionToken: token,
  });
  expect(released).toEqual({ released: 1, rooms: 1 });

  overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: token,
  });
  expect(overview.occupiedBeds).toBe(0);
  expect(overview.orphanedBeds).toBe(0);

  // Closed, never deleted: the room's history keeps the reason (§9).
  const rows = await t.run((ctx) => ctx.db.query("agcRoomAssignments").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].endedAt).toBeTypeOf("number");
  expect(rows[0].endReason).toContain("Guest record no longer exists");

  const again = await t.mutation(api.agcRoomAssignments.releaseOrphanedBeds, {
    sessionToken: token,
  });
  expect(again.released).toBe(0);
});

test("the maintenance runner releases orphaned beds without a browser session", async () => {
  const t = createTestConvex();
  const token = await seedStaff(t);
  const { guestIds } = await seedBooking(t);
  const roomId = await seedRoom(t);
  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: token,
    roomId,
    guestIds,
  });
  await t.run((ctx) => ctx.db.delete(guestIds[0]));

  const released = await t.mutation(internal.agcRoomAssignments.releaseOrphanedBedsInternal, {});
  expect(released).toEqual({ released: 1, rooms: 1 });

  const rows = await t.run((ctx) => ctx.db.query("agcRoomAssignments").collect());
  expect(rows[0].endedAt).toBeTypeOf("number");
  expect(rows[0].endBy).toBe("convex-cli");
});

test("deleting a reservation closes the beds it was holding", async () => {
  const t = createTestConvex();
  const token = await seedStaff(t);
  const { bookingId, repId, guestIds } = await seedBooking(t);
  const roomId = await seedRoom(t);
  await t.mutation(api.agcRoomAssignments.assignGuests, {
    sessionToken: token,
    roomId,
    guestIds,
  });

  const repToken = "rep-session-token";
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRepSessions", {
      repId,
      token: repToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
    // Only an unpaid hold can be deleted, and only a roomable booking can be
    // roomed — so the delegate is assigned first, then the hold is deleted.
    await ctx.db.patch(bookingId, { bookingStatus: "reserved" });
  });

  await t.mutation(api.agcBookings.deleteBooking, { sessionToken: repToken, bookingId });

  const rows = await t.run((ctx) => ctx.db.query("agcRoomAssignments").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].endedAt).toBeTypeOf("number");
  expect(rows[0].endReason).toContain("Reservation deleted");

  const overview = await t.query(api.agcRoomAssignments.getRoomingOverview, {
    sessionToken: token,
  });
  expect(overview.occupiedBeds).toBe(0);
  expect(overview.orphanedBeds).toBe(0);
});
