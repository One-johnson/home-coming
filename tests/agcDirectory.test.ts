import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * The accommodation volunteer is a read-only door role: they see every rep with
 * their delegates and rooms, and nothing else in the console. These tests pin
 * both sides — the directory they may read and the room/desk surfaces they may
 * not.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedStaff(
  t: TestConvex,
  role: "admin" | "accommodation_volunteer" | "content",
) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: role,
      email: `${role}@example.com`,
      passwordHash: "not-a-real-hash",
      role,
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
  return { token };
}

async function seedDirectory(t: TestConvex) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const hubId: Id<"agcHubs"> = await ctx.db.insert("agcHubs", {
      name: "Grace Hub",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: now,
    });
    const repId: Id<"agcRepresentatives"> = await ctx.db.insert(
      "agcRepresentatives",
      {
        hubId,
        username: "grace_hub",
        firstName: "Ama",
        lastName: "Owusu",
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
      paymentMode: "offline",
      paymentStatus: "confirmed",
      bookingStatus: "confirmed",
      referenceNumber: "AGC-BK-9001",
      createdAt: now,
      updatedAt: now,
    });

    const guest = async (firstName: string) =>
      await ctx.db.insert("agcGuests", {
        bookingId,
        hubId,
        region: "ghana",
        country: "Ghana",
        firstName,
        lastName: "Mensah",
        gender: "female",
        title: "Member",
        accommodationType: "dormitory",
        pool: "global",
        isBishopRate: false,
        status: "active",
        createdAt: now,
      });

    const assignedGuestId = await guest("Akosua");
    const unassignedGuestId = await guest("Efua");

    const roomId: Id<"agcRooms"> = await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "Dorm A",
      capacity: 4,
      building: "Blocks 1–4",
    });
    await ctx.db.insert("agcRoomAssignments", {
      roomId,
      guestId: assignedGuestId,
      bookingId,
      createdAt: now,
    });
    await ctx.db.insert("agcCheckIns", {
      guestId: assignedGuestId,
      bookingId,
      hubId,
      roomId,
      roomName: "Dorm A",
      building: "Blocks 1–4",
      location: "central",
      checkedInAt: now,
      checkedInBy: "desk@example.com",
    });

    return { hubId, repId, assignedGuestId, unassignedGuestId, roomId };
  });
}

test("a volunteer sees every delegate with their rep, hub and room", async () => {
  const t = createTestConvex();
  const volunteer = await seedStaff(t, "accommodation_volunteer");
  const seeded = await seedDirectory(t);

  const directory = await t.query(api.agcDirectory.listDelegateDirectory, {
    sessionToken: volunteer.token,
  });

  expect(directory.reps).toHaveLength(1);
  expect(directory.reps[0]).toMatchObject({
    repName: "Ama Owusu",
    hubName: "Grace Hub",
    delegateCount: 2,
    assignedCount: 1,
  });

  const assigned = directory.delegates.find(
    (row) => row.guestId === seeded.assignedGuestId,
  );
  expect(assigned).toMatchObject({
    roomName: "Dorm A",
    building: "Blocks 1–4",
    hubName: "Grace Hub",
    repName: "Ama Owusu",
    bookingRef: "AGC-BK-9001",
    checkedIn: true,
  });
  expect(assigned?.typeLabel).toBeTruthy();

  // A delegate with no bed yet is listed too, so the desk can see the gap.
  const unassigned = directory.delegates.find(
    (row) => row.guestId === seeded.unassignedGuestId,
  );
  expect(unassigned?.roomName).toBeNull();
  expect(unassigned?.checkedIn).toBe(false);
});

test("the directory is read-only for volunteers: room and desk surfaces stay shut", async () => {
  const t = createTestConvex();
  const volunteer = await seedStaff(t, "accommodation_volunteer");
  await seedDirectory(t);

  await expect(() =>
    t.query(api.agcRoomAssignments.listRoomsAdmin, {
      sessionToken: volunteer.token,
    }),
  ).rejects.toThrow(/Unauthorized/);

  await expect(() =>
    t.query(api.agcCheckin.listArrivalDesk, {
      sessionToken: volunteer.token,
    }),
  ).rejects.toThrow(/Unauthorized/);
});

test("an admin can hand an existing staff account the volunteer role", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");
  await seedStaff(t, "content");

  const before = await t.query(api.users.listTeamMembers, {
    sessionToken: admin.token,
  });
  const target = before.find((user) => user.role === "content");
  expect(target).toBeDefined();

  await t.mutation(api.users.setUserRole, {
    sessionToken: admin.token,
    userId: target!._id,
    role: "accommodation_volunteer",
  });

  const after = await t.query(api.users.listTeamMembers, {
    sessionToken: admin.token,
  });
  expect(after.find((user) => user._id === target!._id)?.role).toBe(
    "accommodation_volunteer",
  );
});

test("admins read the same directory, and other staff roles cannot", async () => {
  const t = createTestConvex();
  const admin = await seedStaff(t, "admin");
  const content = await seedStaff(t, "content");
  await seedDirectory(t);

  const asAdmin = await t.query(api.agcDirectory.listDelegateDirectory, {
    sessionToken: admin.token,
  });
  expect(asAdmin.delegates).toHaveLength(2);

  await expect(() =>
    t.query(api.agcDirectory.listDelegateDirectory, {
      sessionToken: content.token,
    }),
  ).rejects.toThrow(/Unauthorized/);
});
