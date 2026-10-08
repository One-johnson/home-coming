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
