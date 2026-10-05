import { expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
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

test("failed sign-in surfaces the exact stored username only when the account exists", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) =>
    ctx.db.insert("agcHubs", { ...HUB, name: "Gabon – Libreville" }),
  );
  const tempPassword = "temp-secret-9";
  const { default: bcrypt } = await import("bcryptjs");
  await seedRep(
    t,
    hubId,
    "gabon_-_libreville",
    await bcrypt.hash(tempPassword, 12),
    tempPassword,
  );

  // Correct username, wrong password: the error carries the exact stored
  // username (punctuation included) so the UI can remind the rep.
  const knownErr = await t.action(api.agcAuth.repLogin, {
    username: "gabon libreville",
    password: "wrong-password",
  }).catch((err: unknown) => err);
  expect(knownErr).toBeInstanceOf(Error);
  expect((knownErr as { data?: { resolvedUsername?: string } }).data)
    .toMatchObject({ resolvedUsername: "gabon_-_libreville" });

  // Unknown username: no resolvedUsername — the failure must stay
  // indistinguishable from a wrong-password failure.
  const unknownErr = await t.action(api.agcAuth.repLogin, {
    username: "no_such_hub",
    password: "wrong-password",
  }).catch((err: unknown) => err);
  expect(unknownErr).toBeInstanceOf(Error);
  expect(
    (unknownErr as { data?: { resolvedUsername?: string } }).data
      ?.resolvedUsername,
  ).toBeUndefined();
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

test("createRep emails initial credentials to the rep", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));

  // Admin principal + session (requireAdminViaAction checks role === "admin").
  const { createHash, randomBytes } = await import("node:crypto");
  const adminToken = createHash("sha256").update(randomBytes(24)).digest("hex");
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
      token: adminToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  const created = await t.action(api.agcAdmin.createRep, {
    sessionToken: adminToken,
    hubId,
    email: "rep@credhub.example",
    clientOrigin: "http://localhost:5401",
  });
  expect(created.username).toBe("test_hub"); // derived from HUB.name
  expect(created.tempPassword.length).toBeGreaterThanOrEqual(8);

  // Rep record is pending setup with the temp password stored.
  const rep = await t.run(async (ctx) =>
    ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", created.username))
      .unique(),
  );
  expect(rep!.status).toBe("pending_setup");
  expect(rep!.mustChangePassword).toBe(true);
  expect(rep!.tempPassword).toBe(created.tempPassword);

  // Credentials email queued (stub status — no SMTP in tests) with a
  // portal link built from the client origin.
  const logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(1);
  expect(logs[0].to).toBe("rep@credhub.example");
  expect(logs[0].type).toBe("agc_rep_notification");
  expect(logs[0].status).toBe("stub");
  const payload = JSON.parse(logs[0].referenceId!) as {
    username: string;
    tempPassword: string;
    isResend: boolean;
    portalUrl: string;
  };
  expect(payload.username).toBe(created.username);
  expect(payload.tempPassword).toBe(created.tempPassword);
  expect(payload.isResend).toBe(false);
  expect(payload.portalUrl).toBe("http://localhost:5401/portal");
});

test("issueTempPassword resets the rep to setup and emails new credentials", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const username = "resend_hub";
  const { default: bcrypt } = await import("bcryptjs");
  const oldHash = await bcrypt.hash("old-active-pass-1", 12);
  const repId = await seedRep(t, hubId, username, oldHash, "old-temp");

  // Make the rep look fully activated with a live session.
  const liveToken = "live-session-token";
  await t.run(async (ctx) => {
    await ctx.db.patch(repId, {
      email: "rep@resend.example",
      status: "active",
      mustChangePassword: false,
      profileComplete: true,
    });
    await ctx.db.insert("agcRepSessions", {
      repId,
      token: liveToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  const { createHash, randomBytes } = await import("node:crypto");
  const adminToken = createHash("sha256").update(randomBytes(24)).digest("hex");
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
      token: adminToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  const resend = await t.action(api.agcAdmin.issueTempPassword, {
    sessionToken: adminToken,
    repId,
    clientOrigin: "http://localhost:3000",
  });
  expect(resend.username).toBe(username);
  expect(resend.tempPassword.length).toBeGreaterThanOrEqual(8);

  // Rep is reset to first-time setup with the new temp password stored.
  const rep = await t.run((ctx) => ctx.db.get(repId));
  expect(rep!.status).toBe("pending_setup");
  expect(rep!.mustChangePassword).toBe(true);
  expect(rep!.tempPassword).toBe(resend.tempPassword);

  // The previously live session was killed.
  const profile = await t.query(api.agcPortal.getRepProfile, {
    sessionToken: liveToken,
  });
  expect(profile).toBeNull();

  // Resend email queued with the new password.
  const logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(1);
  expect(logs[0].to).toBe("rep@resend.example");
  const payload = JSON.parse(logs[0].referenceId!) as {
    tempPassword: string;
    isResend: boolean;
    portalUrl: string;
  };
  expect(payload.tempPassword).toBe(resend.tempPassword);
  expect(payload.isResend).toBe(true);
  expect(payload.portalUrl).toBe("http://localhost:3000/portal");

  // The new temp password signs in (to the setup screen).
  const login = await t.action(api.agcAuth.repLogin, {
    username,
    password: resend.tempPassword,
  });
  expect(login.kind).toBe("setup_required");
});

/** Seed an admin user + session and return the session token. */
async function seedAdmin(t: TestConvex): Promise<string> {
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

test("setRepEmail updates the contact email used for credentials emails", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const adminToken = await seedAdmin(t);

  const repId = await t.run(async (ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId,
      username: "email_hub",
      email: undefined,
      passwordHash: await (
        await import("bcryptjs")
      ).default.hash("whatever-pass-1", 12),
      tempPassword: "whatever-pass-1",
      profileComplete: false,
      mustChangePassword: true,
      status: "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );

  await t.mutation(api.agcAdminData.setRepEmail, {
    sessionToken: adminToken,
    repId,
    email: "contact@emailhub.example",
  });
  let rep = await t.run((ctx) => ctx.db.get(repId));
  expect(rep!.email).toBe("contact@emailhub.example");

  // Duplicate emails across reps are rejected.
  const secondRepId = await t.run(async (ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId,
      username: "other_email_hub",
      email: undefined,
      passwordHash: "x",
      profileComplete: false,
      mustChangePassword: true,
      status: "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );
  await expect(
    t.mutation(api.agcAdminData.setRepEmail, {
      sessionToken: adminToken,
      repId: secondRepId,
      email: "contact@emailhub.example",
    }),
  ).rejects.toThrow(/already in use/i);

  // Clearing works too.
  await t.mutation(api.agcAdminData.setRepEmail, {
    sessionToken: adminToken,
    repId,
    email: "",
  });
  rep = await t.run((ctx) => ctx.db.get(repId));
  expect(rep!.email).toBeUndefined();
});

test("deleteRep removes sessions and throttle rows but keeps the hub", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const adminToken = await seedAdmin(t);
  const username = "doomed_hub";
  const { default: bcrypt } = await import("bcryptjs");
  const repId = await seedRep(
    t,
    hubId,
    username,
    await bcrypt.hash("some-password-1", 12),
    "some-password-1",
  );

  // Give the rep a live session and a throttle row.
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRepSessions", {
      repId,
      token: "doomed-session",
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
    await ctx.db.insert("agcLoginThrottle", {
      key: username,
      failedCount: 2,
      lastFailureAt: Date.now(),
    });
  });

  const result = await t.mutation(api.agcAdminData.deleteRep, {
    sessionToken: adminToken,
    repId,
  });
  expect(result.success).toBe(true);

  // Soft-deleted: session gone, throttle gone, hub kept, record retained.
  const rep = await t.run((ctx) => ctx.db.get(repId));
  expect(rep).not.toBeNull();
  expect(rep!.deletedAt).toBeTypeOf("number");
  const sessions = await t.run((ctx) =>
    ctx.db.query("agcRepSessions").collect(),
  );
  expect(sessions).toHaveLength(0);
  const throttles = await t.run((ctx) =>
    ctx.db.query("agcLoginThrottle").collect(),
  );
  expect(throttles).toHaveLength(0);
  const hub = await t.run((ctx) => ctx.db.get(hubId));
  expect(hub).not.toBeNull();
});

test("deleteRepsBulk removes many reps in one call", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const adminToken = await seedAdmin(t);
  const { default: bcrypt } = await import("bcryptjs");
  const hash = await bcrypt.hash("bulk-pass-123", 12);

  const id1 = await seedRep(t, hubId, "bulk_one", hash, "bulk-pass-123");
  const id2 = await seedRep(t, hubId, "bulk_two", hash, "bulk-pass-123");
  const id3 = await seedRep(t, hubId, "bulk_three", hash, "bulk-pass-123");
  await t.run((ctx) => ctx.db.delete(id3)); // one vanishes before the call

  const result = await t.mutation(api.agcAdminData.deleteRepsBulk, {
    sessionToken: adminToken,
    repIds: [id1, id2, id3],
  });
  expect(result.deleted).toBe(2);
  expect(result.missing).toHaveLength(1);

  const remaining = await t.run((ctx) =>
    ctx.db.query("agcRepresentatives").collect(),
  );
  // All soft-deleted, none live.
  expect(remaining.every((r) => r.deletedAt !== undefined)).toBe(true);
});

test("soft delete hides the rep from logins and lists, restore revives it, purge removes it", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const adminToken = await seedAdmin(t);
  const username = "undo_hub";
  const tempPassword = "undo-temp-123";
  const { default: bcrypt } = await import("bcryptjs");
  const repId = await seedRep(
    t,
    hubId,
    username,
    await bcrypt.hash(tempPassword, 12),
    tempPassword,
  );

  // Give the rep a live session.
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRepSessions", {
      repId,
      token: "undo-session",
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  // Soft delete: still queryable by id, marked deleted, session gone.
  const deleted = await t.mutation(api.agcAdminData.deleteRep, {
    sessionToken: adminToken,
    repId,
  });
  expect(deleted.username).toBe(username);
  expect(deleted.purgeAt).toBeGreaterThan(Date.now());

  const rawRep = await t.run((ctx) => ctx.db.get(repId));
  expect(rawRep!.deletedAt).toBeTypeOf("number");
  expect(rawRep!.status).toBe("disabled");

  // Login with the temp password now fails (lookup excludes deleted).
  await expect(
    t.action(api.agcAuth.repLogin, { username, password: tempPassword }),
  ).rejects.toThrow(/invalid username or password/i);

  // Hidden from the reps list; visible in the deleted list.
  const active = await t.query(api.agcAdminData.listReps, {
    sessionToken: adminToken,
  });
  expect(active.map((r) => r._id)).not.toContain(repId);
  const deletedList = await t.query(api.agcAdminData.listDeletedReps, {
    sessionToken: adminToken,
  });
  expect(deletedList.map((r) => r._id)).toContain(repId);

  // Restore: back in the active list, back to first-time setup.
  await t.mutation(api.agcAdminData.restoreRep, {
    sessionToken: adminToken,
    repId,
  });
  const restored = await t.run((ctx) => ctx.db.get(repId));
  expect(restored!.deletedAt).toBeUndefined();
  expect(restored!.status).toBe("pending_setup");
  expect(restored!.mustChangePassword).toBe(true);
  const activeAfter = await t.query(api.agcAdminData.listReps, {
    sessionToken: adminToken,
  });
  expect(activeAfter.map((r) => r._id)).toContain(repId);
  const deletedAfter = await t.query(api.agcAdminData.listDeletedReps, {
    sessionToken: adminToken,
  });
  expect(deletedAfter.map((r) => r._id)).not.toContain(repId);

  // Soft delete again, then purge via the cron tick.
  await t.mutation(api.agcAdminData.deleteRep, {
    sessionToken: adminToken,
    repId,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(repId, { deletedAt: Date.now() - 8 * 24 * 3_600_000 });
  });
  const purged = await t.mutation(
    internal.agcAdminData.purgeExpiredDeletedReps,
    {},
  );
  expect(purged.purged).toBeGreaterThanOrEqual(1);
  const gone = await t.run((ctx) => ctx.db.get(repId));
  expect(gone).toBeNull();
});

test("restore refuses when another account took the username", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const adminToken = await seedAdmin(t);
  const { default: bcrypt } = await import("bcryptjs");
  const hash = await bcrypt.hash("clash-pass-123", 12);

  const originalId = await seedRep(
    t,
    hubId,
    "clash_hub",
    hash,
    "clash-pass-123",
  );
  await t.mutation(api.agcAdminData.deleteRep, {
    sessionToken: adminToken,
    repId: originalId,
  });

  // A second hub whose derived username collides with the deleted one.
  const secondHub = await t.run((ctx) =>
    ctx.db.insert("agcHubs", { ...HUB, name: "Clash Hub " }),
  );
  const secondId = await seedRep(
    t,
    secondHub,
    "clash_hub",
    hash,
    "clash-pass-123",
  );
  // Two live rows with the same username would not normally exist; simulate
  // the collision by restoring while the second row is live.
  await t.run((ctx) => ctx.db.delete(secondId));
  // Re-insert a live clash via the second hub's rep.
  await seedRep(t, secondHub, "clash_hub", hash, "clash-pass-123");

  await expect(
    t.mutation(api.agcAdminData.restoreRep, {
      sessionToken: adminToken,
      repId: originalId,
    }),
  ).rejects.toThrow(/cannot restore/i);
});

test("getHubRoster aggregates per-hub registration and booking activity", async () => {
  const t = createTestConvex();
  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const adminToken = await seedAdmin(t);
  const { default: bcrypt } = await import("bcryptjs");
  const repId = await seedRep(
    t,
    hubId,
    "roster_hub",
    await bcrypt.hash("roster-pass-1", 12),
    "roster-pass-1",
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: HUB.region,
      quantity: 4,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 120,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: HUB.region,
      quantity: 2,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 60,
      paymentMode: "offline",
      paymentStatus: "pending_verification",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: HUB.region,
      currency: "GHS",
      totalAmount: 40,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      bookingStatus: "confirmed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  const roster = await t.query(api.agcAdminData.getHubRoster, {
    sessionToken: adminToken,
  });
  const row = roster.find((r) => r._id === hubId)!;
  expect(row.rep!.username).toBe("roster_hub");
  expect(row.registrations.total).toBe(2);
  expect(row.registrations.delegates).toBe(6);
  expect(row.registrations.confirmed).toBe(1);
  expect(row.registrations.pending).toBe(1);
  expect(row.bookings.confirmed).toBe(1);
  expect(row.bookings.pending).toBe(0);
  expect(row.needsAttention).toBe(true); // pending registration
});

test("login accepts separator variants of the hub username", async () => {
  const t = createTestConvex();

  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const username = "test_hub";
  const tempPassword = "temp-secret-2";
  const { default: bcrypt } = await import("bcryptjs");
  await seedRep(t, hubId, username, await bcrypt.hash(tempPassword, 12), tempPassword);

  // Underscore, hyphen, space and mixed case all resolve to the same rep —
  // "setup_required" means the rep was found and the password verified.
  for (const variant of ["test-hub", "Test Hub", "TEST-HUB", "  test_hub  "]) {
    const result = (await t.action(api.agcAuth.repLogin, {
      username: variant,
      password: tempPassword,
    })) as RepLoginResult;
    expect(result.kind, `variant: ${variant}`).toBe("setup_required");
  }

  // First-time setup also accepts variants and returns the stored username.
  const setup = (await t.action(api.agcAuth.completeFirstLoginSetup, {
    username: "Test-Hub",
    temporaryPassword: tempPassword,
    newPassword: "my-new-password-2",
    firstName: "Ama",
    lastName: "Mensah",
    email: "ama2@testhub.example",
    phone: "+233200000002",
  })) as RepAuthResult;
  expect(setup.rep.username).toBe(username);

  // Post-setup sign-in with a hyphenated form works with the new password.
  const login = (await t.action(api.agcAuth.repLogin, {
    username: "test hub",
    password: "my-new-password-2",
  })) as RepLoginResult;
  expect(login.kind).toBe("ok");
  if (login.kind !== "ok") return;
  expect(login.result.rep.username).toBe(username);
});

test("legacy punctuation-heavy usernames still sign in after separator typing", async () => {
  const t = createTestConvex();

  const hubId = await t.run((ctx) =>
    ctx.db.insert("agcHubs", { ...HUB, name: "Gabon – Libreville" }),
  );
  const tempPassword = "temp-secret-4";
  const { default: bcrypt } = await import("bcryptjs");
  // Username the OLD deriveUsername produced for "Gabon – Libreville":
  // only whitespace became underscores, so the dash stayed inside.
  await seedRep(
    t,
    hubId,
    "gabon_-_libreville",
    await bcrypt.hash(tempPassword, 12),
    tempPassword,
  );

  // Space, hyphen, or the en-dashed hub name itself — all reach the same
  // rep through the canonical form instead of failing invalid-credentials.
  for (const variant of [
    "gabon libreville",
    "gabon-libreville",
    "Gabon – Libreville",
  ]) {
    const result = (await t.action(api.agcAuth.repLogin, {
      username: variant,
      password: tempPassword,
    })) as RepLoginResult;
    expect(result.kind, `variant: ${variant}`).toBe("setup_required");
  }

  // First-time setup with a separator-typed username works too.
  const setup = (await t.action(api.agcAuth.completeFirstLoginSetup, {
    username: "gabon libreville",
    temporaryPassword: tempPassword,
    newPassword: "my-new-password-4",
    firstName: "Ada",
    lastName: "Ondo",
    email: "ada@gabon.example",
    phone: "+241000000004",
  })) as RepAuthResult;
  expect(setup.rep.username).toBe("gabon_-_libreville");
});

test("addHub creates a hub and rejects case-insensitive duplicates", async () => {
  const t = createTestConvex();

  const { createHash, randomBytes } = await import("node:crypto");
  const adminToken = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin2@example.com",
      passwordHash: "not-a-real-hash",
      role: "admin",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId: adminId,
      token: adminToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  const added = await t.action(api.agcAdmin.addHub, {
    sessionToken: adminToken,
    name: "  Kumasi Asokwa  ",
    region: "ghana",
    country: "Ghana",
  });
  expect(added.name).toBe("Kumasi Asokwa");
  expect(added.repUsername).toBe("kumasi_asokwa");

  // Punctuation in the hub name folds away — no more dashes inside the
  // username (regression for the "Gabon – Libreville" -> "gabon_-_libreville"
  // bug).
  const punctuated = await t.action(api.agcAdmin.addHub, {
    sessionToken: adminToken,
    name: "Gabon – Libreville",
    region: "rest_of_africa",
    country: "Gabon",
  });
  expect(punctuated.repUsername).toBe("gabon_libreville");

  const hub = await t.run(async (ctx) =>
    ctx.db
      .query("agcHubs")
      .withIndex("by_name", (q) => q.eq("name", "Kumasi Asokwa"))
      .unique(),
  );
  expect(hub!.region).toBe("ghana");
  expect(hub!.country).toBe("Ghana");
  expect(hub!.active).toBe(true);

  // A different-cased duplicate is rejected.
  await expect(
    t.action(api.agcAdmin.addHub, {
      sessionToken: adminToken,
      name: "kumasi asokwa",
      region: "ghana",
    }),
  ).rejects.toThrow(/already exists/i);

  // Non-admins are rejected.
  await expect(
    t.action(api.agcAdmin.addHub, {
      sessionToken: "not-a-session",
      name: "Tamale Central",
      region: "ghana",
    }),
  ).rejects.toThrow(/unauthorized/i);
});

test("renameHub rotates the rep username and the old username keeps working", async () => {
  const t = createTestConvex();

  const { default: bcrypt } = await import("bcryptjs");
  const tempPassword = "temp-secret-3";

  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  await seedRep(
    t,
    hubId,
    "old_town_hub",
    await bcrypt.hash(tempPassword, 12),
    tempPassword,
  );
  // Give the rep an email so the rename notification can be verified.
  await t.run(async (ctx) => {
    const rep = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", "old_town_hub"))
      .unique();
    await ctx.db.patch(rep!._id, { email: "rep@oldtown.example" });
  });
  // A second hub keeps the name "Test Hub" (for the duplicate-name check)
  // and a rep whose username derives from nothing — used to prove alias
  // collisions are refused.
  const keeperHubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  void keeperHubId;
  const otherHubId = await t.run((ctx) =>
    ctx.db.insert("agcHubs", { ...HUB, name: "Other Hub" }),
  );
  await seedRep(
    t,
    otherHubId,
    "blocked_name",
    await bcrypt.hash(tempPassword, 12),
    tempPassword,
  );

  const { createHash, randomBytes } = await import("node:crypto");
  const adminToken = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin3@example.com",
      passwordHash: "not-a-real-hash",
      role: "admin",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId: adminId,
      token: adminToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
  });

  const renamed = await t.action(api.agcAdmin.renameHub, {
    sessionToken: adminToken,
    hubId,
    newName: "  New Town Hub  ",
    clientOrigin: "http://localhost:5401",
  });
  expect(renamed.name).toBe("New Town Hub");
  expect(renamed.repUsername).toBe("new_town_hub");

  // Hub and rep records reflect the rename; the old username is an alias.
  const { hub, rep } = await t.run(async (ctx) => {
    const hubDoc = await ctx.db
      .query("agcHubs")
      .withIndex("by_name", (q) => q.eq("name", "New Town Hub"))
      .unique();
    const repDoc = await ctx.db
      .query("agcRepresentatives")
      .withIndex("by_username", (q) => q.eq("username", "new_town_hub"))
      .unique();
    return { hub: hubDoc!, rep: repDoc! };
  });
  expect(hub).toBeTruthy();
  expect(rep.previousUsernames).toContain("old_town_hub");

  // New username signs in…
  const withNew = (await t.action(api.agcAuth.repLogin, {
    username: "new_town_hub",
    password: tempPassword,
  })) as RepLoginResult;
  expect(withNew.kind).toBe("setup_required");

  // …as does a separator variant of the new hub name…
  const withVariant = (await t.action(api.agcAuth.repLogin, {
    username: "new town hub",
    password: tempPassword,
  })) as RepLoginResult;
  expect(withVariant.kind).toBe("setup_required");

  // …and the pre-rename username still resolves via the alias.
  const withOld = (await t.action(api.agcAuth.repLogin, {
    username: "old_town_hub",
    password: tempPassword,
  })) as RepLoginResult;
  expect(withOld.kind).toBe("setup_required");

  // Duplicate hub name (case-insensitive) is rejected.
  await expect(
    t.action(api.agcAdmin.renameHub, {
      sessionToken: adminToken,
      hubId,
      newName: "test hub",
    }),
  ).rejects.toThrow(/already exists/i);

  // A username owned by ANOTHER rep (current or alias) is rejected.
  await expect(
    t.action(api.agcAdmin.renameHub, {
      sessionToken: adminToken,
      hubId,
      newName: "Blocked Name",
    }),
  ).rejects.toThrow(/already uses/i);

  // The rep was emailed the new username (failed renames queue nothing).
  const logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(1);
  expect(logs[0].to).toBe("rep@oldtown.example");
  expect(logs[0].body).toContain("Previous username: old_town_hub");
  expect(logs[0].body).toContain("New username: new_town_hub");
  expect(logs[0].body).toContain("http://localhost:5401/portal");
});

test("rep-facing email endpoints share a per-mailbox send cap", async () => {
  const t = createTestConvex();

  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  await t.run((ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId,
      username: "throttle_hub",
      email: "ama@throttle.example",
      passwordHash: "not-a-real-hash",
      profileComplete: false,
      mustChangePassword: true,
      status: "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );

  // Three reset requests land (EMAIL_MAX_SENDS)…
  for (let i = 0; i < 3; i += 1) {
    const result = await t.action(api.agcAuth.requestPasswordReset, {
      username: "throttle_hub",
    });
    expect(result.success).toBe(true);
  }
  let logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(3);

  // …the fourth is silently suppressed (still reports success)…
  const fourth = await t.action(api.agcAuth.requestPasswordReset, {
    username: "throttle_hub",
  });
  expect(fourth.success).toBe(true);
  logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(3);

  // …and switching to the username-reminder flow does not bypass the cap:
  // both endpoints draw from the same per-mailbox bucket.
  const reminder = await t.action(api.agcAuth.requestUsernameReminder, {
    email: "ama@throttle.example",
  });
  expect(reminder.success).toBe(true);
  logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(3);

  // The mailbox allowance row exists under its namespaced key.
  const rows = await t.run((ctx) => ctx.db.query("agcLoginThrottle").collect());
  expect(rows.map((r) => r.key)).toContain("email:mailbox:ama@throttle.example");

  // Unknown users still produce nothing (no enumeration, no allowance use).
  await t.action(api.agcAuth.requestPasswordReset, { username: "ghost_hub" });
  await t.action(api.agcAuth.requestUsernameReminder, {
    email: "ghost@nowhere.example",
  });
  logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(3);
});

test("requestUsernameReminder emails the exact username without enumerating", async () => {
  const t = createTestConvex();

  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const { default: bcrypt } = await import("bcryptjs");
  await t.run((ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId,
      username: "remind_hub",
      email: "ama@remindhub.example",
      passwordHash: bcrypt.hashSync("whatever-secret-1", 12),
      profileComplete: false,
      mustChangePassword: true,
      status: "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );

  // Registered address → reminder queued with the exact username.
  const hit = await t.action(api.agcAuth.requestUsernameReminder, {
    email: "  Ama@RemindHub.example ",
    clientOrigin: "http://localhost:5401",
  });
  expect(hit.success).toBe(true);

  let logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(1);
  expect(logs[0].to).toBe("ama@remindhub.example");
  expect(logs[0].body).toContain("Username: remind_hub");
  expect(logs[0].body).toContain("http://localhost:5401/portal");

  // Unknown address → same success, no email (no enumeration).
  const miss = await t.action(api.agcAuth.requestUsernameReminder, {
    email: "nobody@nowhere.example",
  });
  expect(miss.success).toBe(true);

  logs = await t.run((ctx) => ctx.db.query("emailLogs").collect());
  expect(logs).toHaveLength(1);
});

test("migrateRepUsernames rewrites punctuation usernames and keeps them as aliases", async () => {
  const t = createTestConvex();
  const adminToken = await seedAdmin(t);

  const legacyHubId = await t.run((ctx) =>
    ctx.db.insert("agcHubs", {
      name: "Gabon – Libreville",
      region: "rest_of_africa" as const,
      country: "Gabon",
      active: true,
      createdAt: Date.now(),
    }),
  );
  const cleanHubId = await t.run((ctx) =>
    ctx.db.insert("agcHubs", {
      name: "Kumasi Asokwa",
      region: "ghana" as const,
      country: "Ghana",
      active: true,
      createdAt: Date.now(),
    }),
  );

  const { default: bcrypt } = await import("bcryptjs");
  const tempPassword = "temp-secret-1";
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // Legacy account: punctuation baked into the stored username.
  const legacyRepId = await seedRep(
    t,
    legacyHubId,
    "gabon_-_libreville",
    passwordHash,
    tempPassword,
  );
  // Already-canonical account, with a rename alias — must stay untouched.
  const cleanRepId = await seedRep(
    t,
    cleanHubId,
    "kumasi_asokwa",
    passwordHash,
    tempPassword,
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(cleanRepId, { previousUsernames: ["old_kumasi"] });
  });

  const result = await t.mutation(api.agcAdminData.migrateRepUsernames, {
    sessionToken: adminToken,
  });

  expect(result.migrated).toEqual([
    { repId: legacyRepId, from: "gabon_-_libreville", to: "gabon_libreville" },
  ]);
  expect(result.skipped).toEqual([]);

  const [legacyRep, cleanRep] = await t.run(async (ctx) => [
    await ctx.db.get(legacyRepId),
    await ctx.db.get(cleanRepId),
  ]);
  expect(legacyRep!.username).toBe("gabon_libreville");
  expect(legacyRep!.previousUsernames).toContain("gabon_-_libreville");
  expect(cleanRep!.username).toBe("kumasi_asokwa");
  expect(cleanRep!.previousUsernames).toEqual(["old_kumasi"]);

  // Old spelling still signs in (as does any separator variant).
  const viaAlias = await t.action(api.agcAuth.repLogin, {
    username: "gabon_-_libreville",
    password: tempPassword,
  });
  expect(viaAlias.kind).toBe("setup_required");
  const viaCanonical = await t.action(api.agcAuth.repLogin, {
    username: "gabon libreville",
    password: tempPassword,
  });
  expect(viaCanonical.kind).toBe("setup_required");

  // Second run is a no-op.
  const again = await t.mutation(api.agcAdminData.migrateRepUsernames, {
    sessionToken: adminToken,
  });
  expect(again.migrated).toEqual([]);
  expect(again.skipped).toEqual([]);

  // Non-admins are rejected.
  await expect(
    t.mutation(api.agcAdminData.migrateRepUsernames, {
      sessionToken: "not-a-session",
    }),
  ).rejects.toThrow(/unauthorized/i);
});

test("migrateRepUsernames skips usernames whose canonical form is already taken", async () => {
  const t = createTestConvex();
  const adminToken = await seedAdmin(t);

  const hubId = await t.run((ctx) => ctx.db.insert("agcHubs", HUB));
  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash("temp-secret-1", 12);

  // Another live rep already holds the canonical form as their username.
  await seedRep(t, hubId, "gabon_libreville", passwordHash, "temp-secret-1");
  const punctuationRepId = await seedRep(
    t,
    hubId,
    "gabon_-_libreville",
    passwordHash,
    "temp-secret-1",
  );
  // A rep whose rename alias claims the canonical form of another legacy rep.
  const aliasHolderId = await seedRep(
    t,
    hubId,
    "coast_hub",
    passwordHash,
    "temp-secret-1",
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(aliasHolderId, {
      previousUsernames: ["takoradi-west"],
    });
  });
  const aliasBlockedId = await seedRep(
    t,
    hubId,
    "takoradi.west",
    passwordHash,
    "temp-secret-1",
  );

  const result = await t.mutation(api.agcAdminData.migrateRepUsernames, {
    sessionToken: adminToken,
  });

  expect(result.migrated).toEqual([]);
  expect(result.skipped).toEqual([
    {
      username: "gabon_-_libreville",
      target: "gabon_libreville",
      reason: "canonical form already used by another account",
    },
    {
      username: "takoradi.west",
      target: "takoradi_west",
      reason: "canonical form already used by another account",
    },
  ]);

  // Nothing changed on disk.
  const [punctuationRep, aliasBlockedRep] = await t.run(async (ctx) => [
    await ctx.db.get(punctuationRepId),
    await ctx.db.get(aliasBlockedId),
  ]);
  expect(punctuationRep!.username).toBe("gabon_-_libreville");
  expect(aliasBlockedRep!.username).toBe("takoradi.west");
});
