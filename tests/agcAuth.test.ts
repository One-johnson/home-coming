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
