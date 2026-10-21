import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Pre-arrival readiness checklist: flagged imports vs. confirmed pools,
 * EBPV apartment rules, publish coverage, and assignment coverage.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedStaff(
  t: TestConvex,
  role: "admin" | "registration" | "accommodation" | "finance" | "content",
) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: role,
      email: `${role}@example.com`,
      passwordHash: "not-a-real-hash",
      role,
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: now + 3_600_000,
      createdAt: now,
    });
  });
  return { token };
}

test("readiness flags missing pools, empty import, and unpublished occupancy (§28, §3, §8, §17)", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");

  // Nothing configured at all: every check should complain.
  const empty = await t.query(api.agcPreArrival.getReadiness, {
    sessionToken: admin.token,
  });
  const byKey = (key: string) =>
    empty.items.find((item) => item.key === key)!;
  expect(byKey("pools").status).toBe("warn");
  expect(byKey("import").status).toBe("error"); // no rooms imported at all
  expect(byKey("assignments").status).toBe("ok"); // zero eligible delegates
  expect(empty.overallOk).toBe(false);
});

test("readiness turns green once pools, imports, publishing and assignments line up", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");

  await t.run(async (ctx) => {
    const now = Date.now();
    // Confirmed pools: dormitory global 8.
    await ctx.db.insert("agcInventoryPools", {
      accommodationType: "dormitory",
      scope: "global",
      total: 8,
      reserved: 0,
      confirmed: 0,
    });
    // Two dorm rooms, capacity 8 total, one published + occupied, one free.
    const roomIdA: Id<"agcRooms"> = await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "Dorm 1",
      capacity: 4,
      publishedAt: now,
      publishedBy: "seed",
    });
    await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "Dorm 2",
      capacity: 4,
    });

    const hubId: Id<"agcHubs"> = await ctx.db.insert("agcHubs", {
      name: "Hub",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: now,
    });
    const repId: Id<"agcRepresentatives"> = await ctx.db.insert(
      "agcRepresentatives",
      {
        hubId,
        username: "hub_a",
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
      totalAmount: 0,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      bookingStatus: "confirmed",
      createdAt: now,
      updatedAt: now,
    });
    const guestId: Id<"agcGuests"> = await ctx.db.insert("agcGuests", {
      bookingId,
      hubId,
      region: "ghana",
      country: "Ghana",
      firstName: "Foo",
      lastName: "Bar",
      gender: "male",
      title: "Member",
      accommodationType: "dormitory",
      pool: "global",
      isBishopRate: false,
      status: "active",
      createdAt: now,
    });
    // The occupied room is published → publishing check green.
    await ctx.db.insert("agcRoomAssignments", {
      roomId: roomIdA,
      guestId,
      bookingId,
      assignedBy: "seed",
      createdAt: now,
    });
  });

  const readiness = await t.query(api.agcPreArrival.getReadiness, {
    sessionToken: admin.token,
  });
  const byKey = (key: string) =>
    readiness.items.find((item) => item.key === key)!;
  expect(byKey("pools").status).toBe("warn"); // other types still unconfigured
  expect(byKey("import").status).toBe("ok"); // imported capacity == pool
  expect(byKey("publish").status).toBe("ok"); // occupied room is published
  expect(byKey("assignments").status).toBe("ok");
  expect(byKey("ebpv").status).toBe("ok");

  // Occupied-but-unpublished flips the publish check to warn.
  await t.run(async (ctx) => {
    const room = await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "Hidden occupied",
      capacity: 2,
    });
    const guest = (await ctx.db.query("agcGuests").collect()).find(
      (g) => (g as { status: string }).status === "active",
    );
    await ctx.db.insert("agcRoomAssignments", {
      roomId: room as Id<"agcRooms">,
      guestId: guest!._id,
      bookingId: guest!.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });
  const after = await t.query(api.agcPreArrival.getReadiness, {
    sessionToken: admin.token,
  });
  expect(
    after.items.find((i) => i.key === "publish")!.status,
  ).toBe("warn");
});

test("an EBPV apartment breaking the rules is a blocking error", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRooms", {
      accommodationType: "ebpv",
      name: "Apartment X",
      capacity: 5,
    });
  });
  const readiness = await t.query(api.agcPreArrival.getReadiness, {
    sessionToken: admin.token,
  });
  const ebpv = readiness.items.find((i) => i.key === "ebpv")!;
  expect(ebpv.status).toBe("error");
  expect(ebpv.detail).toMatch(/Apartment X/);
});
