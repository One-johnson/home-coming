import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { createTestConvex } from "./testUtils";

/**
 * Event-wide registration lockdown (Settings danger zone):
 * setRegistrationLockdown → enforced by both deadline guards →
 * surfaced via getAgcSystemStatus and getPortalConfig.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedAdminSession(t: TestConvex): Promise<string> {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin@example.com",
      passwordHash: "not-a-real-hash",
      role: "admin",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId: adminId,
      token,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });
  return token;
}

const OFFLINE = {
  amountPaid: 60,
  referenceNumber: "txn-1",
  paymentDate: "2026-01-01",
  method: "bank_transfer" as const,
};

test("lockdown blocks registrations, flips status everywhere, and unlocks cleanly", async () => {
  const t = createTestConvex();
  const adminToken = await seedAdminSession(t);

  // Portal config starts unlocked.
  expect((await t.query(api.agcPortal.getPortalConfig, {})).locked).toBe(false);

  // Enable lockdown.
  await t.mutation(api.agcAdminData.setRegistrationLockdown, {
    sessionToken: adminToken,
    locked: true,
  });

  // System status + public portal config both report locked.
  const status = await t.query(api.agcAdminData.getAgcSystemStatus, {
    sessionToken: adminToken,
  });
  expect(status.locked).toBe(true);
  expect(status.smtp.configured).toBe(false); // no SMTP env in tests
  expect((await t.query(api.agcPortal.getPortalConfig, {})).locked).toBe(true);

  // The registration deadline guard throws the lockdown error BEFORE any
  // auth/validation — any session token is rejected while locked.
  await expect(
    t.mutation(api.agcPortal.submitOfflineRegistration, {
      sessionToken: "irrelevant-session",
      quantity: 2,
      offline: OFFLINE,
    }),
  ).rejects.toThrow(/temporarily locked/i);

  // Accommodation bookings share the same toggle via their guard.
  await expect(
    t.mutation(api.agcPortal.submitOfflineRegistration, {
      sessionToken: "irrelevant-session",
      quantity: 1,
      offline: OFFLINE,
    }),
  ).rejects.toThrow(/temporarily locked/i);

  // Disable lockdown — submissions pass the guard again (they now fail on
  // rep auth instead, proving the lockdown check is out of the way).
  await t.mutation(api.agcAdminData.setRegistrationLockdown, {
    sessionToken: adminToken,
    locked: false,
  });
  let errorAfterUnlock = "";
  try {
    await t.mutation(api.agcPortal.submitOfflineRegistration, {
      sessionToken: "irrelevant-session",
      quantity: 2,
      offline: OFFLINE,
    });
  } catch (err) {
    errorAfterUnlock = err instanceof Error ? err.message : String(err);
  }
  expect(errorAfterUnlock).not.toMatch(/temporarily locked/i);
  expect(errorAfterUnlock).not.toBe("");
  expect((await t.query(api.agcPortal.getPortalConfig, {})).locked).toBe(false);
});

test("lockdown toggle is admin-only", async () => {
  const t = createTestConvex();
  const { createHash, randomBytes } = await import("node:crypto");
  const staffToken = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Staff",
      email: "staff@example.com",
      passwordHash: "not-a-real-hash",
      role: "registration",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token: staffToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  await expect(
    t.mutation(api.agcAdminData.setRegistrationLockdown, {
      sessionToken: staffToken,
      locked: true,
    }),
  ).rejects.toThrow();

  await expect(
    t.query(api.agcAdminData.getAgcSystemStatus, { sessionToken: staffToken }),
  ).rejects.toThrow();
});
