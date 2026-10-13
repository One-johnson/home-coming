import { expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Two related rules:
 *
 * 1. A confirmed registration (payment credited) or a confirmed accommodation
 *    (beds locked in) can never be deleted — not one by one, not in bulk. The
 *    only affordance in the admin tables is the selection-based bulk delete,
 *    which keeps confirmed rows and reports them back.
 * 2. Every bed a finished booking still holds is returned to its pool by the
 *    reconciliation action, which is idempotent (a bed is never returned
 *    twice) and also expires holds whose window has lapsed.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedAdminAndHub(t: TestConvex) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin@example.com",
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
    const hubId: Id<"agcHubs"> = await ctx.db.insert("agcHubs", {
      name: "Ashanti Mampong",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: Date.now(),
    });
    const repId: Id<"agcRepresentatives"> = await ctx.db.insert(
      "agcRepresentatives",
      {
        hubId,
        username: "ashanti_mampong",
        passwordHash: "not-a-hash",
        profileComplete: true,
        mustChangePassword: false,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    );
    return { hubId, repId };
  });
  return { token, ...ids };
}

test("confirmed registrations and accommodations cannot be deleted", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();

  const ids = await t.run(async (ctx) => {
    const confirmedRegistration = await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 2,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 60,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      referenceNumber: "REG-CONFIRMED",
      createdAt: now,
      updatedAt: now,
    });
    const pendingRegistration = await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 1,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 30,
      paymentMode: "offline",
      paymentStatus: "pending_verification",
      referenceNumber: "REG-PENDING",
      createdAt: now,
      updatedAt: now,
    });
    const confirmedBooking = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 300,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      bookingStatus: "confirmed",
      referenceNumber: "STY-CONFIRMED",
      createdAt: now,
      updatedAt: now,
    });
    const reservedBooking = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 150,
      paymentMode: "offline",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      expiresAt: now + 3_600_000,
      referenceNumber: "STY-RESERVED",
      createdAt: now,
      updatedAt: now,
    });
    return {
      confirmedRegistration,
      pendingRegistration,
      confirmedBooking,
      reservedBooking,
    };
  });

  // Single-row deletes are refused outright for confirmed records.
  await expect(
    t.mutation(api.agcAdminData.deleteAgcRegistration, {
      sessionToken: token,
      registrationId: ids.confirmedRegistration,
    }),
  ).rejects.toThrow(/Confirmed registrations cannot be deleted/);
  await expect(
    t.mutation(api.agcAdminData.deleteAgcBooking, {
      sessionToken: token,
      bookingId: ids.confirmedBooking,
    }),
  ).rejects.toThrow(/Confirmed accommodation cannot be deleted/);

  // A selection made only of confirmed rows is refused as well — nothing to
  // delete is an error, not a silent no-op.
  await expect(
    t.mutation(api.agcAdminData.deleteAgcRegistrationsBulk, {
      sessionToken: token,
      ids: [ids.confirmedRegistration],
    }),
  ).rejects.toThrow(/Confirmed registrations cannot be deleted/);
  await expect(
    t.mutation(api.agcAdminData.deleteAgcBookingsBulk, {
      sessionToken: token,
      ids: [ids.confirmedBooking],
    }),
  ).rejects.toThrow(/Confirmed accommodation cannot be deleted/);

  // Mixed selections delete what they can and report the confirmed rows kept.
  const registrations = await t.mutation(
    api.agcAdminData.deleteAgcRegistrationsBulk,
    {
      sessionToken: token,
      ids: [ids.confirmedRegistration, ids.pendingRegistration],
    },
  );
  expect(registrations).toEqual({ deleted: 1, skippedConfirmed: 1 });

  const bookings = await t.mutation(api.agcAdminData.deleteAgcBookingsBulk, {
    sessionToken: token,
    ids: [ids.confirmedBooking, ids.reservedBooking],
  });
  expect(bookings).toEqual({ deleted: 1, skippedConfirmed: 1 });

  const data = await t.run(async (ctx) => ({
    confirmedRegistration: await ctx.db.get(ids.confirmedRegistration),
    pendingRegistration: await ctx.db.get(ids.pendingRegistration),
    confirmedBooking: await ctx.db.get(ids.confirmedBooking),
    reservedBooking: await ctx.db.get(ids.reservedBooking),
  }));
  // Confirmed rows are untouched — not trashed, not altered.
  expect(data.confirmedRegistration?.deletedAt).toBeUndefined();
  expect(data.confirmedRegistration?.paymentStatus).toBe("confirmed");
  expect(data.confirmedBooking?.deletedAt).toBeUndefined();
  expect(data.confirmedBooking?.bookingStatus).toBe("confirmed");
  // Everything else lands in the trash as before.
  expect(data.pendingRegistration?.deletedAt).toBeTypeOf("number");
  expect(data.reservedBooking?.deletedAt).toBeTypeOf("number");
  expect(data.reservedBooking?.bookingStatus).toBe("expired");
});

test("returnExpiredBookingsToPools returns held beds once, from the right counter", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();

  const ids = await t.run(async (ctx) => {
    // A confirmed booking closed before confirmed units were released: the
    // ledger records reserve + confirm but no release, and the pool still
    // counts its beds as confirmed.
    const leakedBooking = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 450,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      bookingStatus: "expired",
      referenceNumber: "STY-LEAKED",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookingLines", {
      bookingId: leakedBooking,
      accommodationType: "dormitory",
      quantity: 3,
      unitPrice: 150,
      isBishopRate: false,
    });
    const dormitoryPool = await ctx.db.insert("agcInventoryPools", {
      accommodationType: "dormitory",
      scope: "africa",
      total: 1000,
      reserved: 0,
      confirmed: 3,
    });
    await ctx.db.insert("agcInventoryLedger", {
      poolId: dormitoryPool,
      accommodationType: "dormitory",
      scope: "africa",
      action: "reserve",
      delta: 3,
      bookingId: leakedBooking,
      createdAt: now,
    });
    await ctx.db.insert("agcInventoryLedger", {
      poolId: dormitoryPool,
      accommodationType: "dormitory",
      scope: "africa",
      action: "confirm",
      delta: 3,
      bookingId: leakedBooking,
      createdAt: now,
    });

    // A cancelled booking that already returned its bed — the ledger has the
    // matching cancel entry, so nothing may be returned again.
    const cleanBooking = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 150,
      paymentMode: "offline",
      paymentStatus: "rejected",
      bookingStatus: "cancelled",
      referenceNumber: "STY-CLEAN",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookingLines", {
      bookingId: cleanBooking,
      accommodationType: "hostel",
      quantity: 1,
      unitPrice: 150,
      isBishopRate: false,
    });
    const hostelPool = await ctx.db.insert("agcInventoryPools", {
      accommodationType: "hostel",
      scope: "africa",
      total: 700,
      reserved: 2,
      confirmed: 0,
    });
    await ctx.db.insert("agcInventoryLedger", {
      poolId: hostelPool,
      accommodationType: "hostel",
      scope: "africa",
      action: "reserve",
      delta: 1,
      bookingId: cleanBooking,
      createdAt: now,
    });
    await ctx.db.insert("agcInventoryLedger", {
      poolId: hostelPool,
      accommodationType: "hostel",
      scope: "africa",
      action: "cancel",
      delta: -1,
      bookingId: cleanBooking,
      createdAt: now,
    });

    // A legacy payment-on-arrival hold whose 72h window has lapsed: the same
    // action expires it and its two hostel beds (still counted as reserved).
    const lapsedBooking = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 300,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      poa: { status: "pending" },
      expiresAt: now - 1_000,
      referenceNumber: "STY-LAPSED",
      createdAt: now - 86_400_000,
      updatedAt: now - 86_400_000,
    });
    await ctx.db.insert("agcBookingLines", {
      bookingId: lapsedBooking,
      accommodationType: "hostel",
      quantity: 2,
      unitPrice: 150,
      isBishopRate: false,
    });

    return { leakedBooking, dormitoryPool, cleanBooking, hostelPool, lapsedBooking };
  });

  const first = await t.mutation(api.agcAdminData.returnExpiredBookingsToPools, {
    sessionToken: token,
  });
  expect(first.expiredHolds).toBe(1);
  expect(first.bookings).toBe(1);
  expect(first.units).toBe(3);

  const after = await t.run(async (ctx) => ({
    dormitoryPool: await ctx.db.get(ids.dormitoryPool),
    hostelPool: await ctx.db.get(ids.hostelPool),
    lapsed: await ctx.db.get(ids.lapsedBooking),
    clean: await ctx.db.get(ids.cleanBooking),
    ledger: await ctx.db.query("agcInventoryLedger").collect(),
  }));
  // The leaked confirmed beds came out of `confirmed`, not `reserved`.
  expect(after.dormitoryPool?.confirmed).toBe(0);
  expect(after.dormitoryPool?.reserved).toBe(0);
  expect(
    after.ledger.some(
      (entry) =>
        entry.bookingId === ids.leakedBooking &&
        entry.action === "release" &&
        entry.delta === -3,
    ),
  ).toBe(true);
  // The lapsed hold was expired and returned its reserved beds.
  expect(after.lapsed?.bookingStatus).toBe("expired");
  expect(after.hostelPool?.reserved).toBe(0);
  // The already-released cancellation was left alone.
  expect(after.clean?.bookingStatus).toBe("cancelled");
  expect(
    after.ledger.filter(
      (entry) =>
        entry.bookingId === ids.cleanBooking &&
        entry.action === "release",
    ),
  ).toHaveLength(0);

  // Idempotent: a second pass finds nothing left to return.
  const second = await t.mutation(
    api.agcAdminData.returnExpiredBookingsToPools,
    { sessionToken: token },
  );
  expect(second).toEqual({ expiredHolds: 0, bookings: 0, units: 0 });

  const finalLedger = await t.run(async (ctx) =>
    ctx.db.query("agcInventoryLedger").collect(),
  );
  expect(
    finalLedger.filter(
      (entry) =>
        entry.bookingId === ids.leakedBooking && entry.delta < 0,
    ),
  ).toHaveLength(1);
});

/**
 * A confirmed booking closed while it still held its confirmed beds, plus the
 * pool carrying them — the shape the repair exists to fix.
 */
async function seedLeakedBooking(
  t: TestConvex,
  args: { hubId: Id<"agcHubs">; repId: Id<"agcRepresentatives">; referenceNumber: string },
) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const bookingId = await ctx.db.insert("agcBookings", {
      hubId: args.hubId,
      repId: args.repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 300,
      paymentMode: "offline",
      paymentStatus: "confirmed",
      bookingStatus: "expired",
      referenceNumber: args.referenceNumber,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookingLines", {
      bookingId,
      accommodationType: "dormitory",
      quantity: 2,
      unitPrice: 150,
      isBishopRate: false,
    });
    const poolId = await ctx.db.insert("agcInventoryPools", {
      accommodationType: "dormitory",
      scope: "africa",
      total: 1000,
      reserved: 0,
      confirmed: 2,
    });
    await ctx.db.insert("agcInventoryLedger", {
      poolId,
      accommodationType: "dormitory",
      scope: "africa",
      action: "reserve",
      delta: 2,
      bookingId,
      createdAt: now,
    });
    await ctx.db.insert("agcInventoryLedger", {
      poolId,
      accommodationType: "dormitory",
      scope: "africa",
      action: "confirm",
      delta: 2,
      bookingId,
      createdAt: now,
    });
    return { bookingId, poolId };
  });
}

test("the nightly repair returns held beds on its own and alerts the desk once", async () => {
  const t = createTestConvex();
  const { hubId, repId } = await seedAdminAndHub(t);
  const leaked = await seedLeakedBooking(t, {
    hubId,
    repId,
    referenceNumber: "STY-NIGHTLY",
  });

  const tick = await t.mutation(internal.crons.nightlyPoolRepairTick, {});
  expect(tick).toEqual({ expiredHolds: 0, bookings: 1, units: 2 });

  const after = await t.run(async (ctx) => ({
    pool: await ctx.db.get(leaked.poolId),
    emails: await ctx.db.query("emailLogs").collect(),
  }));
  expect(after.pool?.confirmed).toBe(0);

  // The desk hears about it: one alert per active user with a desk role.
  const alerts = after.emails.filter(
    (mail) => mail.type === "agc_pool_repair_alert",
  );
  expect(alerts).toHaveLength(1);
  expect(alerts[0].to).toBe("admin@example.com");
  expect(alerts[0].subject).toContain("2 bed(s) returned");
  expect(alerts[0].body).toContain("Bookings that gave beds back: 1");

  // Nothing left to return → nothing to say. Re-running stays silent.
  const second = await t.mutation(internal.crons.nightlyPoolRepairTick, {});
  expect(second).toEqual({ expiredHolds: 0, bookings: 0, units: 0 });
  const emailsAfter = await t.run(async (ctx) =>
    ctx.db.query("emailLogs").collect(),
  );
  expect(
    emailsAfter.filter((mail) => mail.type === "agc_pool_repair_alert"),
  ).toHaveLength(1);
});

test("the Pools tab repair history names each booking and its bed count", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  await seedLeakedBooking(t, {
    hubId,
    repId,
    referenceNumber: "STY-HISTORY",
  });

  await t.mutation(api.agcAdminData.returnExpiredBookingsToPools, {
    sessionToken: token,
  });

  const history = await t.query(api.agcAdminData.listPoolRepairsAdmin, {
    sessionToken: token,
  });
  // Newest first: the manual run, then the booking it returned beds for.
  expect(history.map((row) => row.kind)).toEqual(["run", "booking"]);
  expect(history[0].actorEmail).toBe("admin@example.com");
  expect(history[0].units).toBe(2);
  expect(history[1].referenceNumber).toBe("STY-HISTORY");
  expect(history[1].units).toBe(2);
  expect(history[1].bookingStatus).toBe("expired");
});
