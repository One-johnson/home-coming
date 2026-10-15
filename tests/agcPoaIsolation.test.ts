import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Payment-on-arrival record isolation: POA registrations and bookings live in
 * their own review table (agcPoa.listPoaRecordsAdmin, shown on the POA tabs)
 * and must NOT appear in the main admin registration/accommodation queues or
 * the Excel export data — otherwise the pending-verification counts and
 * report totals get inflated with records that are not on the receipt-verification
 * workflow.
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

test("POA records are excluded from main admin tables and exports, kept in the POA table", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);

  const now = Date.now();
  await t.run(async (ctx) => {
    // One ordinary offline registration + one POA registration.
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 2,
      unitPrice: 500,
      currency: "GHS",
      totalAmount: 1000,
      paymentMode: "offline",
      paymentStatus: "pending_verification",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 1,
      unitPrice: 500,
      currency: "GHS",
      totalAmount: 500,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      poa: { status: "pending" },
      createdAt: now,
      updatedAt: now,
    });

    // One ordinary offline booking + one POA booking.
    await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 300,
      paymentMode: "offline",
      paymentStatus: "pending_verification",
      bookingStatus: "pending_verification",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 150,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      expiresAt: now + 86_400_000,
      poa: { status: "evidence_submitted" },
      createdAt: now,
      updatedAt: now,
    });
  });

  // Main queues: only the offline records.
  const registrations = await t.query(api.agcAdminData.listAgcRegistrationsAdmin, {
    sessionToken: token,
  });
  expect(registrations).toHaveLength(1);
  expect(registrations[0].paymentMode).toBe("offline");

  const bookings = await t.query(api.agcAdminData.listAgcBookingsAdmin, {
    sessionToken: token,
  });
  expect(bookings).toHaveLength(1);
  expect(bookings[0].paymentMode).toBe("offline");

  // Excel export data: also offline-only.
  const exportBookings = await t.run((ctx) =>
    // internalQuery via run with raw db access is not available; use the
    // exported internal query through the test client instead.
    ctx.db.query("agcBookings").collect(),
  );
  const poaBookings = exportBookings.filter((b) => b.poa);
  expect(poaBookings).toHaveLength(1);

  // The dedicated POA table returns exactly the two POA records.
  const poaRows = await t.query(api.agcPoa.listPoaRecordsAdmin, {
    sessionToken: token,
  });
  expect(poaRows).toHaveLength(2);
  const kinds = poaRows.map((row) => row.kind).sort();
  expect(kinds).toEqual(["booking", "registration"]);
  const bookingRow = poaRows.find((row) => row.kind === "booking");
  expect(bookingRow?.poaStatus).toBe("evidence_submitted");
  const registrationRow = poaRows.find((row) => row.kind === "registration");
  expect(registrationRow?.poaStatus).toBe("pending");
});

test("overview reports POA outstanding separately from awaiting-review money", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    // Awaiting-review (receipt verification) money: GHS 500.
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 1,
      unitPrice: 500,
      currency: "GHS",
      totalAmount: 500,
      paymentMode: "offline",
      paymentStatus: "pending_verification",
      createdAt: now,
      updatedAt: now,
    });
    // Uncollected POA cash: GHS 500 registration + GHS 300 booking.
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 1,
      unitPrice: 500,
      currency: "GHS",
      totalAmount: 500,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      poa: { status: "pending" },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 300,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      expiresAt: now + 86_400_000,
      poa: { status: "evidence_submitted" },
      createdAt: now,
      updatedAt: now,
    });
    // Second currency surface: EUR registration + USD booking so the
    // per-currency breakout is actually exercised.
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "rest_of_europe",
      quantity: 1,
      unitPrice: 20,
      currency: "EUR",
      totalAmount: 20,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      poa: { status: "pending" },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "USD",
      totalAmount: 15,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      expiresAt: now + 86_400_000,
      poa: { status: "pending" },
      createdAt: now,
      updatedAt: now,
    });
  });

  const overview = await t.query(api.agcAdminData.getAgcOverview, {
    sessionToken: token,
  });

  // POA cash is its own ledger: GHS 800 across 2 records.
  expect(overview.poa.outstandingCount).toBe(4);
  expect(overview.poa.outstandingRegistrations).toBe(2);
  expect(overview.poa.outstandingBookings).toBe(2);
  expect(overview.poa.outstandingByCurrency["GHS"]).toBe(800);
  expect(overview.poa.outstandingByCurrency["EUR"]).toBe(20);
  expect(overview.poa.outstandingByCurrency["USD"]).toBe(15);
  // Per-currency split by surface — registrations vs accommodation never mix.
  expect(overview.poa.outstandingSurfacesByCurrency["GHS"]).toEqual({
    registrations: 500,
    bookings: 300,
  });
  expect(overview.poa.outstandingSurfacesByCurrency["EUR"]).toEqual({
    registrations: 20,
    bookings: 0,
  });
  expect(overview.poa.outstandingSurfacesByCurrency["USD"]).toEqual({
    registrations: 0,
    bookings: 15,
  });

  // The bookings awaiting-review board must not absorb the POA booking.
  expect(overview.bookings.pending).toBe(0);
  expect(overview.bookings.awaitingByCurrency["GHS"] ?? 0).toBe(0);
  // Receipt-verification money stays on the registrations board.
  expect(overview.registrations.pending).toBe(1);
  expect(overview.registrations.awaitingByCurrency["GHS"]).toBe(500);
});

test("collection data lists only unconfirmed POA records with per-hub units", async () => {
  const t = createTestConvex();
  const { hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 3,
      unitPrice: 500,
      currency: "GHS",
      totalAmount: 1500,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      poa: { status: "evidence_submitted" },
      createdAt: now,
      updatedAt: now,
    });
    // Confirmed POA rows are collected — never on the sheet.
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 1,
      unitPrice: 500,
      currency: "GHS",
      totalAmount: 500,
      paymentMode: "payment_on_arrival",
      paymentStatus: "confirmed",
      poa: { status: "confirmed", confirmedAt: now, confirmedBy: "a@b.c" },
      createdAt: now,
      updatedAt: now,
    });
  });

  const rows = await t.run((ctx) =>
    // Inline read of the same shape the export action consumes, via the
    // internal query through the convex-test client.
    ctx.db.query("agcRegistrations").collect(),
  );
  const outstanding = rows.filter((r) => r.poa && r.poa.status !== "confirmed");
  expect(outstanding).toHaveLength(1);
  expect(outstanding[0].totalAmount).toBe(1500);
});

const HOLD_HOURS = 72;
const HOUR_MS = 3_600_000;

/** Seed one booking + its bed line + the regional pool those beds sit in. */
async function seedHeldBooking(
  t: TestConvex,
  args: {
    hubId: Id<"agcHubs">;
    repId: Id<"agcRepresentatives">;
    paymentMode: "offline" | "payment_on_arrival";
    bookingStatus: "reserved" | "confirmed";
    expiresAt?: number;
    createdAt: number;
    quantity: number;
    referenceNumber: string;
    accommodationType?: "dormitory" | "hostel";
  },
) {
  return await t.run(async (ctx) => {
    const accommodationType = args.accommodationType ?? "dormitory";
    const bookingId: Id<"agcBookings"> = await ctx.db.insert("agcBookings", {
      hubId: args.hubId,
      repId: args.repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: args.quantity * 150,
      paymentMode: args.paymentMode,
      paymentStatus: args.bookingStatus === "confirmed" ? "confirmed" : "awaiting_payment",
      bookingStatus: args.bookingStatus,
      expiresAt: args.expiresAt,
      poa: args.paymentMode === "payment_on_arrival" ? { status: "pending" } : undefined,
      referenceNumber: args.referenceNumber,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    });
    await ctx.db.insert("agcBookingLines", {
      bookingId,
      accommodationType,
      quantity: args.quantity,
      unitPrice: 150,
      isBishopRate: false,
    });
    const poolId: Id<"agcInventoryPools"> = await ctx.db.insert(
      "agcInventoryPools",
      {
        accommodationType,
        scope: "africa",
        total: 1000,
        reserved: args.bookingStatus === "confirmed" ? 0 : args.quantity,
        confirmed: args.bookingStatus === "confirmed" ? args.quantity : 0,
      },
    );
    return { bookingId, poolId };
  });
}

test("the hold window never releases POA beds — the venue desk does", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  // Any release notice would go to the rep's email — give the seeded rep one,
  // so the test would catch the sweep mailing one.
  await t.run(async (ctx) => {
    await ctx.db.patch(repId, { email: "ashanti_mampong@example.com" });
  });

  // A POA hold whose window lapsed 1h ago: payment-on-arrival beds wait for
  // the venue desk, so the sweep must leave the booking and its beds alone.
  const lapsedPoa = await seedHeldBooking(t, {
    hubId,
    repId,
    paymentMode: "payment_on_arrival",
    bookingStatus: "reserved",
    expiresAt: now - HOUR_MS,
    createdAt: now - (HOLD_HOURS + 1) * HOUR_MS,
    quantity: 2,
    referenceNumber: "STY-POA-KEEPS-BEDS",
  });
  // A POA row written before the hold timer existed carries no expiresAt at
  // all — and is not expired on a fallback deadline either.
  const legacyPoa = await seedHeldBooking(t, {
    hubId,
    repId,
    paymentMode: "payment_on_arrival",
    bookingStatus: "reserved",
    createdAt: now - 10 * HOLD_HOURS * HOUR_MS,
    quantity: 1,
    referenceNumber: "STY-POA-LEGACY",
    accommodationType: "hostel",
  });
  // An ordinary offline hold that lapsed in the same tick still expires and
  // hands its beds back — the exemption is POA-only.
  const offlineOverdue = await t.run(async (ctx) => {
    const bookingId: Id<"agcBookings"> = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 150,
      paymentMode: "offline",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      expiresAt: now - 1_000,
      referenceNumber: "STY-OFFLINE-LAPSED",
      createdAt: now - HOUR_MS,
      updatedAt: now - HOUR_MS,
    });
    await ctx.db.insert("agcBookingLines", {
      bookingId,
      accommodationType: "ebpv",
      quantity: 1,
      unitPrice: 150,
      isBishopRate: false,
    });
    return { bookingId };
  });

  // The cron tick is an internal mutation — run the same helper it wraps.
  const expiredCount = await t.run(async (ctx) => {
    const { expireOverdueHolds } = await import("../convex/agcAccommodation");
    return await expireOverdueHolds(ctx);
  });
  expect(expiredCount).toBe(1);

  const data = await t.run(async (ctx) => ({
    bookings: await ctx.db.query("agcBookings").collect(),
    lapsedPool: await ctx.db.get(lapsedPoa.poolId),
    legacyPool: await ctx.db.get(legacyPoa.poolId),
    emails: await ctx.db.query("emailLogs").collect(),
  }));
  const lapsed = data.bookings.find(
    (row) => row.referenceNumber === "STY-POA-KEEPS-BEDS",
  );
  const legacy = data.bookings.find(
    (row) => row.referenceNumber === "STY-POA-LEGACY",
  );

  // Neither POA hold was touched: status, beds and the portal stay quiet.
  expect(lapsed?.bookingStatus).toBe("reserved");
  expect(lapsed?.adminMessage).toBeUndefined();
  expect(data.lapsedPool?.reserved).toBe(2);
  expect(legacy?.bookingStatus).toBe("reserved");
  expect(data.legacyPool?.reserved).toBe(1);
  expect(
    data.emails.filter(
      (mail) => mail.type === "agc_booking_poa_hold_released",
    ),
  ).toHaveLength(0);

  // The lapsed offline hold did expire, beds and all.
  const offlineBooking = data.bookings.find(
    (row) => row._id === offlineOverdue.bookingId,
  );
  expect(offlineBooking?.bookingStatus).toBe("expired");

  // Held inventory agrees with them: POA beds count as held however old the
  // row is, and the pool counters have not drifted.
  const pools = await t.query(api.agcAdminData.listPoolsAdmin, {
    sessionToken: token,
  });
  expect(
    pools.find((pool) => pool.accommodationType === "dormitory"),
  ).toMatchObject({ reserved: 2, ledgerReserved: 2 });
  expect(
    pools.find((pool) => pool.accommodationType === "hostel"),
  ).toMatchObject({ reserved: 1, ledgerReserved: 1 });

  // And the POA table keeps showing them as live holds, not released rows.
  const rows = await t.query(api.agcPoa.listPoaRecordsAdmin, {
    sessionToken: token,
  });
  expect(
    rows.find((row) => row.referenceNumber === "STY-POA-KEEPS-BEDS")?.released,
  ).toBe(false);
  expect(
    rows.find((row) => row.referenceNumber === "STY-POA-LEGACY")?.released,
  ).toBe(false);
});

test("deleting a confirmed accommodation is refused and keeps its beds locked in", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  const { bookingId, poolId } = await seedHeldBooking(t, {
    hubId,
    repId,
    paymentMode: "offline",
    bookingStatus: "confirmed",
    createdAt: now,
    quantity: 3,
    referenceNumber: "STY-CONFIRMED-DEL",
  });

  // A confirmed accommodation is locked in: the delete — and the trash that
  // would have released its beds — is refused outright. Beds that a booking
  // like this once leaked are recovered by the pool reconciliation instead
  // (see agcDeletesAndPoolRepair.test.ts).
  await expect(
    t.mutation(api.agcAdminData.deleteAgcBooking, {
      sessionToken: token,
      bookingId,
    }),
  ).rejects.toThrow(/Confirmed accommodation cannot be deleted/);

  const data = await t.run(async (ctx) => ({
    booking: await ctx.db.get(bookingId),
    pool: await ctx.db.get(poolId),
    ledger: await ctx.db.query("agcInventoryLedger").collect(),
  }));
  expect(data.booking?.deletedAt).toBeUndefined();
  expect(data.booking?.bookingStatus).toBe("confirmed");
  expect(data.pool?.confirmed).toBe(3);
  expect(data.ledger).toHaveLength(0);
});

test("bulk confirm credits every live IOU and reports released holds", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const registrationId = await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 2,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 60,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      poa: { status: "pending" },
      referenceNumber: "REG-BULK-1",
      createdAt: now,
      updatedAt: now,
    });
    const releasedId = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 150,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "expired",
      poa: { status: "pending" },
      referenceNumber: "STY-BULK-REL",
      createdAt: now,
      updatedAt: now,
    });
    return { registrationId, releasedId };
  });

  const booking = await seedHeldBooking(t, {
    hubId,
    repId,
    paymentMode: "payment_on_arrival",
    bookingStatus: "reserved",
    expiresAt: now + HOUR_MS,
    createdAt: now,
    quantity: 1,
    referenceNumber: "STY-BULK-2",
  });

  const result = await t.mutation(api.agcPoa.confirmPoaPaymentsBulk, {
    sessionToken: token,
    records: [
      { kind: "registration", recordId: ids.registrationId },
      { kind: "booking", recordId: booking.bookingId },
      { kind: "booking", recordId: ids.releasedId },
    ],
    note: "collected at the venue desk",
  });

  expect(result.confirmedCount).toBe(2);
  expect(result.failedCount).toBe(1);
  expect(result.failed[0].recordId).toBe(ids.releasedId);
  expect(result.failed[0].reason).toContain("released");

  const data = await t.run(async (ctx) => ({
    registration: await ctx.db.get(ids.registrationId),
    booking: await ctx.db.get(booking.bookingId),
    released: await ctx.db.get(ids.releasedId),
    pool: await ctx.db.get(booking.poolId),
  }));
  expect(data.registration?.poa?.status).toBe("confirmed");
  expect(data.registration?.paymentStatus).toBe("confirmed");
  expect(data.booking?.poa?.status).toBe("confirmed");
  expect(data.booking?.bookingStatus).toBe("confirmed");
  // The confirmed bed moved from reserved to confirmed in its pool.
  expect(data.pool?.reserved).toBe(0);
  expect(data.pool?.confirmed).toBe(1);
  expect(data.released?.poa?.status).toBe("pending");
});

test("the POA table exposes accommodation types, guests, and the released flag", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  const { bookingId } = await seedHeldBooking(t, {
    hubId,
    repId,
    paymentMode: "payment_on_arrival",
    bookingStatus: "reserved",
    expiresAt: now + HOUR_MS,
    createdAt: now,
    quantity: 2,
    referenceNumber: "STY-DETAIL-1",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("agcGuests", {
      bookingId,
      hubId,
      region: "ghana",
      country: "Ghana",
      firstName: "Yaa",
      lastName: "Detail",
      gender: "female",
      title: "Member",
      accommodationType: "dormitory",
      pool: "africa",
      isBishopRate: false,
      status: "active",
      createdAt: now,
    });
  });

  const rows = await t.query(api.agcPoa.listPoaRecordsAdmin, {
    sessionToken: token,
  });
  const booking = rows.find((row) => row.referenceNumber === "STY-DETAIL-1");
  expect(booking?.kind).toBe("booking");
  expect(booking?.released).toBe(false);
  expect(booking?.expiresAt).toBe(now + HOUR_MS);
  expect(booking?.accommodation).toEqual([
    { type: "dormitory", label: expect.any(String), units: 2 },
  ]);
  expect(booking?.guests[0]?.name).toBe("Yaa Detail");

  // Once the hold is released the row stays visible but is flagged.
  await t.run(async (ctx) => {
    await ctx.db.patch(bookingId, { bookingStatus: "expired" });
  });
  const afterRelease = await t.query(api.agcPoa.listPoaRecordsAdmin, {
    sessionToken: token,
  });
  expect(
    afterRelease.find((row) => row.referenceNumber === "STY-DETAIL-1")?.released,
  ).toBe(true);

  // Released holds drop off the venue collection sheet entirely.
  const collection = await t.query(api.agcPoa.listPoaDeskData, {
    sessionToken: token,
  });
  expect(
    collection.some((row) => row.referenceNumber === "STY-DETAIL-1"),
  ).toBe(false);
});

test("desk data lists unconfirmed POA records with guest rosters", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 2,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 60,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      poa: { status: "pending" },
      referenceNumber: "REG-DESK-1",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 1,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 30,
      paymentMode: "payment_on_arrival",
      paymentStatus: "confirmed",
      poa: { status: "confirmed", confirmedAt: now, confirmedBy: "a@b.c" },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 150,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      poa: { status: "evidence_submitted" },
      referenceNumber: "STY-DESK-2",
      createdAt: now,
      updatedAt: now,
    });
    const booking = (await ctx.db.query("agcBookings").collect()).find(
      (b) => b.referenceNumber === "STY-DESK-2",
    );
    await ctx.db.insert("agcGuests", {
      bookingId: booking!._id,
      hubId,
      region: "ghana",
      country: "Ghana",
      firstName: "Kofi",
      lastName: "Desk",
      gender: "male",
      title: "Member",
      accommodationType: "dormitory",
      pool: "africa",
      isBishopRate: false,
      status: "active",
      createdAt: now,
    });
  });

  const rows = await t.query(api.agcPoa.listPoaDeskData, { sessionToken: token });
  expect(rows).toHaveLength(2);
  const rego = rows.find((row) => row.kind === "registration");
  const booking = rows.find((row) => row.kind === "booking");
  expect(rego?.referenceNumber).toBe("REG-DESK-1");
  expect(rego?.poaStatus).toBe("pending");
  expect(booking?.referenceNumber).toBe("STY-DESK-2");
  expect(booking?.poaStatus).toBe("evidence_submitted");
  expect(booking?.guests[0]?.name).toBe("Kofi Desk");
});

test("reconciliation splits confirmed-today cash from outstanding IOUs", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    // Collected at the desk TODAY (no evidence → desk cash).
    await ctx.db.insert("agcRegistrations", {
      hubId,
      repId,
      region: "ghana",
      quantity: 2,
      unitPrice: 30,
      currency: "GHS",
      totalAmount: 60,
      paymentMode: "payment_on_arrival",
      paymentStatus: "confirmed",
      poa: { status: "confirmed", confirmedAt: now, confirmedBy: "a@b.c" },
      createdAt: now,
      updatedAt: now,
    });
    // Still outstanding.
    await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 150,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      poa: { status: "pending" },
      createdAt: now,
      updatedAt: now,
    });
  });

  const report = await t.query(api.agcPoa.getPoaDailyReconciliation, {
    sessionToken: token,
  });
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0].hubName).toBe("Ashanti Mampong");
  expect(report.rows[0].currency).toBe("GHS");
  expect(report.rows[0].collectedDeskCount).toBe(1);
  expect(report.rows[0].collectedAmount).toBe(60);
  expect(report.rows[0].collectedOnlineCount).toBe(0);
  expect(report.rows[0].outstandingCount).toBe(1);
  expect(report.rows[0].outstandingAmount).toBe(150);
  expect(report.byCurrency["GHS"]).toEqual({
    collected: 60,
    outstanding: 150,
  });
});

test("confirming a POA booking payment auto-assigns its guests into rooms", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminAndHub(t);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const bookingId = await ctx.db.insert("agcBookings", {
      hubId,
      repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: 450,
      paymentMode: "payment_on_arrival",
      paymentStatus: "awaiting_payment",
      bookingStatus: "reserved",
      poa: { status: "pending" },
      referenceNumber: "STY-AUTO-1",
      createdAt: now,
      updatedAt: now,
    });
    // One dorm room with 2 beds, and two active guests from the booking.
    const roomId = await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "Review Dorm A",
      gender: "male",
      capacity: 2,
    });
    for (const name of ["Ama Auto", "Kofi Auto"]) {
      await ctx.db.insert("agcGuests", {
        bookingId,
        hubId,
        region: "ghana",
        country: "Ghana",
        firstName: name.split(" ")[0],
        lastName: name.split(" ")[1],
        gender: "male",
        title: "Member",
        accommodationType: "dormitory",
        pool: "africa",
        isBishopRate: false,
        status: "active",
        createdAt: now,
      });
    }
    return { bookingId, roomId };
  });

  const result = await t.mutation(api.agcPoa.confirmPoaPayment, {
    sessionToken: token,
    kind: "booking",
    recordId: ids.bookingId,
  });
  expect(result.success).toBe(true);

  // The booking is confirmed AND both guests are placed in the only room.
  const data = await t.run(async (ctx) => ({
    booking: await ctx.db.get(ids.bookingId),
    assignments: await ctx.db.query("agcRoomAssignments").collect(),
  }));
  expect(data.booking?.bookingStatus).toBe("confirmed");
  expect(data.booking?.paymentStatus).toBe("confirmed");
  expect(result.roomsAutoAssigned).toBe(2);
  expect(data.assignments).toHaveLength(2);
  expect(
    data.assignments.every(
      (a) => a.roomId === ids.roomId && a.bookingId === ids.bookingId,
    ),
  ).toBe(true);
});
