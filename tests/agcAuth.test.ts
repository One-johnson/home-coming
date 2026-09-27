import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { RepAuthResult, RepLoginResult } from "../convex/agcAuth";
import { createTestConvex } from "./testUtils";

/**
 * Walks the full representative lifecycle:
 *   temp-password login → first-time setup → activation → auto sign-in →
 *   portal access → sign-out.
 *
 * Setup intentionally issues a session (auto-login), so the "activation on
 * second login" leg is exercised as an extra sign-in with the new password,
 * which is also what reps do when they return later.
 */

const HUB = {
  name: "Test Hub",
  region: "ghana" as const,
  country: "Ghana",
  active: true,
  createdAt: Date.now(),
};

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedRep(
  t: TestConvex,
  hubId: string,
  username: string,
  passwordHash: string,
  tempPassword: string,
) {
  return t.run((ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId,
      username,
      email: undefined,
      passwordHash,
      tempPassword,
      profileComplete: false,
      mustChangePassword: true,
      status: "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );
}

test("rep lifecycle: setup auto-signs-in, account activates, later sign-in works", async () => {
  const t = createTestConvex();

  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const username = "test_hub";
  const tempPassword = "temp-secret-1";

  // Hash with the app's rounds; bcryptjs runs fine in the test runtime.
  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await seedRep(t, hubId, username, passwordHash, tempPassword);

  // 1) First sign-in with the temporary password → setup_required (no throw).
  const first = (await t.action(api.agcAuth.repLogin, {
    username,
    password: tempPassword,
  })) as RepLoginResult;
  expect(first.kind).toBe("setup_required");

  // 2) Complete first-time setup → session is issued (auto sign-in).
  const newPassword = "my-new-password-1";
  const setup = (await t.action(api.agcAuth.completeFirstLoginSetup, {
    username,
    temporaryPassword: tempPassword,
    newPassword,
    firstName: "Ama",
    lastName: "Mensah",
    email: "ama@testhub.example",
    phone: "+233200000001",
  })) as RepAuthResult;
  expect(setup.sessionToken).toBeTruthy();
  expect(setup.rep.username).toBe(username);
  expect(setup.rep.hubName).toBe(HUB.name);
  expect(setup.rep.email).toBe("ama@testhub.example");

  const setupToken = setup.sessionToken;

  // 3) Account is activated: status=active, temp password cleared,
  //    sessions rotated to exactly the one issued by setup.
  const afterSetup = await t.run(async (ctx) => {
    const rep = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    const sessions = await ctx.db
      .query("agcRepSessions")
      .withIndex("by_rep", (q) => q.eq("repId", rep!._id))
      .collect();
    return {
      rep: rep!,
      sessionTokens: sessions.map((s) => s.token),
    };
  });
  expect(afterSetup.rep.status).toBe("active");
  expect(afterSetup.rep.mustChangePassword).toBe(false);
  expect(afterSetup.rep.profileComplete).toBe(true);
  expect(afterSetup.rep.tempPassword).toBeUndefined();
  expect(afterSetup.sessionTokens).toEqual([setupToken]);

  // 4) The auto-login session grants portal access (profile query works).
  const profile = await t.query(api.agcPortal.getRepProfile, {
    sessionToken: setupToken,
  });
  expect(profile?.username).toBe(username);
  expect(profile?.profileComplete).toBe(true);

  // 5) Signing in again with the NEW password succeeds and rotates sessions.
  const second = (await t.action(api.agcAuth.repLogin, {
    username,
    password: newPassword,
  })) as RepLoginResult;
  expect(second.kind).toBe("ok");
  if (second.kind !== "ok") return;
  expect(second.result.rep.hubName).toBe(HUB.name);

  const tokensAfterSecondLogin = await t.run(async (ctx) => {
    const rep = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    const sessions = await ctx.db
      .query("agcRepSessions")
      .withIndex("by_rep", (q) => q.eq("repId", rep!._id))
      .collect();
    return sessions.map((s) => s.token);
  });
  expect(tokensAfterSecondLogin).toEqual([second.result.sessionToken]);

  // 6) Sign-out invalidates the session.
  await t.mutation(api.agcPortal.logoutRep, {
    sessionToken: second.result.sessionToken,
  });
  const profileAfterLogout = await t.query(api.agcPortal.getRepProfile, {
    sessionToken: second.result.sessionToken,
  });
  expect(profileAfterLogout).toBeNull();
});

test("temp password stops working after activation; old password rejected", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const username = "other_hub";
  const tempPassword = "temp-secret-2";
  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await seedRep(t, hubId, username, passwordHash, tempPassword);

  // Login with temp password → setup_required.
  const first = (await t.action(api.agcAuth.repLogin, {
    username,
    password: tempPassword,
  })) as RepLoginResult;
  expect(first.kind).toBe("setup_required");

  const newPassword = "brand-new-pass-2";
  const setup = (await t.action(api.agcAuth.completeFirstLoginSetup, {
    username,
    temporaryPassword: tempPassword,
    newPassword,
    firstName: "Kofi",
    lastName: "Boateng",
    email: "kofi@otherhub.example",
    phone: "+233200000002",
  })) as RepAuthResult;
  expect(setup.sessionToken).toBeTruthy();

  // The temp password no longer signs in…
  await expect(
    t.action(api.agcAuth.repLogin, { username, password: tempPassword }),
  ).rejects.toThrow(/invalid username or password/i);

  // …and the new password does.
  const again = (await t.action(api.agcAuth.repLogin, {
    username,
    password: newPassword,
  })) as RepLoginResult;
  expect(again.kind).toBe("ok");
});

test("repeated wrong passwords lock the account, then it recovers", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const username = "locked_hub";
  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash("correct-horse-1", 12);
  await seedRep(t, hubId, username, passwordHash, "unused-temp");

  // Pre-check gate triggers before bcrypt once the row is locked.
  await t.run(async (ctx) => {
    await ctx.db.insert("agcLoginThrottle", {
      key: username,
      failedCount: 5,
      lockedUntil: Date.now() + 60_000,
      lastFailureAt: Date.now(),
    });
  });

  await expect(
    t.action(api.agcAuth.repLogin, { username, password: "correct-horse-1" }),
  ).rejects.toThrow(/too many failed attempts/i);

  // After the lock expires, the correct password signs in.
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("agcLoginThrottle")
      .withIndex("by_key", (q) => q.eq("key", username))
      .unique();
    await ctx.db.patch(row!._id, { lockedUntil: Date.now() - 1 });
  });

  const result = (await t.action(api.agcAuth.repLogin, {
    username,
    password: "correct-horse-1",
  })) as RepLoginResult;
  // Account still requires first-time setup, so the expected outcome is the
  // setup screen (the lock is gone — not a "locked out" error).
  expect(result.kind).toBe("setup_required");
});
