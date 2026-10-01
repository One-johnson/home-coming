import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { createTestConvex } from "./testUtils";

/**
 * One-click "reset all passwords": every pending-setup rep account gets one
 * shared fresh temporary password; activated and disabled accounts are
 * skipped untouched.
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

async function seedHub(t: TestConvex, name: string) {
  return t.run((ctx) =>
    ctx.db.insert("agcHubs", {
      name,
      region: "ghana" as const,
      country: "Ghana",
      active: true,
      createdAt: Date.now(),
    }),
  );
}

async function seedRep(
  t: TestConvex,
  hubId: string,
  username: string,
  overrides: Partial<{
    status: "pending_setup" | "active" | "disabled";
    passwordHash: string;
    tempPassword: string;
    mustChangePassword: boolean;
    profileComplete: boolean;
  }> = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId,
      username,
      passwordHash: overrides.passwordHash ?? "hash-placeholder",
      tempPassword: overrides.tempPassword,
      profileComplete: overrides.profileComplete ?? false,
      mustChangePassword: overrides.mustChangePassword ?? true,
      status: overrides.status ?? "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );
}

test("resetAllRepPasswords rotates every pending-setup account to one shared password", async () => {
  const t = createTestConvex();
  const adminToken = await seedAdminSession(t);

  const { default: bcrypt } = await import("bcryptjs");
  const activeHash = await bcrypt.hash("rep-owns-this-1", 4);

  const pendingHubId = await seedHub(t, "Ashanti Mampong");
  const activeHubId = await seedHub(t, "London Central");
  const disabledHubId = await seedHub(t, "Kumasi Central");

  const pendingRepId = await seedRep(t, pendingHubId, "ashanti_mampong", {
    status: "pending_setup",
    passwordHash: await bcrypt.hash("old-temp-pass-1", 4),
    tempPassword: "old-temp-pass-1",
  });
  const activeRepId = await seedRep(t, activeHubId, "london_central", {
    status: "active",
    passwordHash: activeHash,
    mustChangePassword: false,
    profileComplete: true,
  });
  await seedRep(t, disabledHubId, "kumasi_central", {
    status: "disabled",
    tempPassword: "old-disabled-1",
  });

  const result = await t.action(api.agcAdmin.resetAllRepPasswords, {
    sessionToken: adminToken,
  });

  // Only the pending-setup account is reset — to the one shared password.
  expect(result.reset).toHaveLength(1);
  expect(result.reset[0]).toMatchObject({
    hubName: "Ashanti Mampong",
    username: "ashanti_mampong",
    tempPassword: result.tempPassword,
  });
  expect(result.tempPassword.length).toBeGreaterThanOrEqual(8);

  // Active and disabled accounts are reported as skipped.
  expect(result.skipped.map((s) => s.hubName).sort()).toEqual([
    "Kumasi Central",
    "London Central",
  ]);

  // The pending rep now authenticates against the shared password and its
  // stored temp password matches exactly.
  const pendingRep = await t.run((ctx) => ctx.db.get(pendingRepId));
  expect(pendingRep!.tempPassword).toBe(result.tempPassword);
  expect(await bcrypt.compare(result.tempPassword, pendingRep!.passwordHash)).toBe(
    true,
  );

  // The active rep's private password is untouched.
  const activeRep = await t.run((ctx) => ctx.db.get(activeRepId));
  expect(activeRep!.passwordHash).toBe(activeHash);
  expect(activeRep!.tempPassword).toBeUndefined();
});

test("resetAllRepPasswords is admin-only", async () => {
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
    t.action(api.agcAdmin.resetAllRepPasswords, { sessionToken: staffToken }),
  ).rejects.toThrow();
});
