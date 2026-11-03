import { expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import { createTestConvex } from "./testUtils";

/**
 * The `open` / `live` mirrors are what the arrival desk reads by, and Convex
 * cannot index a field that is missing. Rows written before the mirrors existed
 * are invisible until the backfill stamps them — in production that backfill
 * died at the 4,096-read limit, so the desk reported nobody assigned and nobody
 * checked in while 1,354 check-ins sat in the table.
 *
 * These tests pin the paged contract: a page never reads a whole table, the
 * caller loops on `cursor` until `isDone`, the boolean is derived from the row's
 * own timestamp, and a second pass changes nothing.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seed(t: TestConvex) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const hubId = await ctx.db.insert("agcHubs", {
      name: "Test Hub",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: now,
    });
    const repId = await ctx.db.insert("agcRepresentatives", {
      hubId,
      username: "test_hub",
      passwordHash: "not-a-hash",
      profileComplete: true,
      mustChangePassword: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const bookingId = await ctx.db.insert("agcBookings", {
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
    const roomId = await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "C5 R1",
      capacity: 4,
      building: "C5",
    });
    const guestId = await ctx.db.insert("agcGuests", {
      bookingId,
      hubId,
      region: "ghana",
      country: "Ghana",
      firstName: "Ama",
      lastName: "Mensah",
      gender: "female",
      title: "Member",
      accommodationType: "dormitory",
      pool: "global",
      isBishopRate: false,
      status: "active",
      createdAt: now,
    });
    const otherGuestId = await ctx.db.insert("agcGuests", {
      bookingId,
      hubId,
      region: "ghana",
      country: "Ghana",
      firstName: "Kofi",
      lastName: "Owusu",
      gender: "male",
      title: "Member",
      accommodationType: "dormitory",
      pool: "global",
      isBishopRate: false,
      status: "active",
      createdAt: now,
    });

    const openAssignment = await ctx.db.insert("agcRoomAssignments", {
      roomId,
      guestId,
      bookingId,
      createdAt: now,
    });
    const closedAssignment = await ctx.db.insert("agcRoomAssignments", {
      roomId,
      guestId: otherGuestId,
      bookingId,
      createdAt: now,
      endedAt: now,
      endReason: "Moved room",
    });
    const liveCheckIn = await ctx.db.insert("agcCheckIns", {
      guestId,
      bookingId,
      hubId,
      roomId,
      roomName: "C5 R1",
      location: "central",
      checkedInAt: now,
      checkedInBy: "desk@example.com",
    });
    const correctedCheckIn = await ctx.db.insert("agcCheckIns", {
      guestId: otherGuestId,
      bookingId,
      hubId,
      roomId,
      roomName: "C5 R1",
      location: "central",
      checkedInAt: now,
      checkedInBy: "desk@example.com",
      correctedAt: now,
      correctedBy: "desk@example.com",
      correctionReason: "Wrong delegate",
    });
    const openFlag = await ctx.db.insert("agcCheckinFlags", {
      guestId,
      bookingId,
      note: "Check the spelling on the passport",
      raisedAt: now,
      raisedBy: "desk@example.com",
    });
    return {
      openAssignment,
      closedAssignment,
      liveCheckIn,
      correctedCheckIn,
      openFlag,
    };
  });
}

/** Walk one table exactly as the CLI runner does, one row per page. */
async function runTable(
  t: TestConvex,
  table: "assignments" | "checkIns" | "flags",
  limit = 1,
) {
  let cursor: string | undefined;
  let patched = 0;
  let pages = 0;
  for (;;) {
    const page = await t.mutation(internal.agcOpenFlags.backfill, {
      table,
      limit,
      ...(cursor ? { cursor } : {}),
    });
    patched += page.patched;
    pages += 1;
    if (page.isDone) break;
    if (!page.cursor) throw new Error("page without a cursor");
    cursor = page.cursor;
  }
  return { patched, pages };
}

test("the backfill pages through a table and derives each mirror from its timestamp", async () => {
  const t = createTestConvex();
  const ids = await seed(t);

  expect((await runTable(t, "assignments")).patched).toBe(2);
  expect((await runTable(t, "checkIns")).patched).toBe(2);
  expect((await runTable(t, "flags")).patched).toBe(1);

  const assignments = await t.run((ctx) =>
    ctx.db.query("agcRoomAssignments").collect(),
  );
  const byId = new Map(assignments.map((row) => [row._id, row] as const));
  expect(byId.get(ids.openAssignment)?.open).toBe(true);
  expect(byId.get(ids.closedAssignment)?.open).toBe(false);

  const checkIns = await t.run((ctx) => ctx.db.query("agcCheckIns").collect());
  const checkInById = new Map(checkIns.map((row) => [row._id, row] as const));
  expect(checkInById.get(ids.liveCheckIn)?.live).toBe(true);
  expect(checkInById.get(ids.correctedCheckIn)?.live).toBe(false);

  const flags = await t.run((ctx) => ctx.db.query("agcCheckinFlags").collect());
  expect(flags.find((row) => row._id === ids.openFlag)?.open).toBe(true);

  // The indexes and the timestamps now agree in both directions.
  const report = await t.query(internal.agcOpenFlags.verify, {});
  expect(report.assignments.missingCount).toBe(0);
  expect(report.assignments.staleCount).toBe(0);
  expect(report.checkIns.missingCount).toBe(0);
  expect(report.checkIns.indexed).toBe(1);
  expect(report.flags.missingCount).toBe(0);

  // Re-running is a no-op, so the runner can be restarted safely.
  expect((await runTable(t, "assignments")).patched).toBe(0);
  expect((await runTable(t, "checkIns")).patched).toBe(0);
  expect((await runTable(t, "flags")).patched).toBe(0);
});

test("a wrong mirror is corrected, not trusted", async () => {
  const t = createTestConvex();
  const seeded = await seed(t);
  await t.run((ctx) =>
    ctx.db.patch(seeded.openAssignment, { open: false }),
  );

  const page = await t.mutation(internal.agcOpenFlags.backfill, {
    table: "assignments",
    limit: 10,
  });
  expect(page.patched).toBe(2);
  const row = await t.run((ctx) => ctx.db.get(seeded.openAssignment));
  expect(row?.open).toBe(true);
});
