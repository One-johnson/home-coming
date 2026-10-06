import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { AgcRegion } from "../convex/schemaTypes";
import { createTestConvex } from "./testUtils";

/**
 * Finance dashboard (admin overview) — SRS §58 puts finance in the payment
 * review loop, so the overview query must serve the finance role the same
 * registration + accommodation payment data the console queues show, with
 * every total split per currency (cedis and dollars are never summed).
 */

type TestConvex = ReturnType<typeof createTestConvex>;
type HubId = Id<"agcHubs">;
type RepId = Id<"agcRepresentatives">;

async function seedSessionToken(
  t: TestConvex,
  role: "admin" | "finance" | "registration",
  email: string,
): Promise<string> {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: role === "finance" ? "Finance" : "Admin",
      email,
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
  return token;
}

async function seedHubWithRep(
  t: TestConvex,
  hub: { name: string; region: AgcRegion; country: string },
): Promise<{ hubId: HubId; repId: RepId }> {
  const hubId = await t.run((ctx) =>
    ctx.db.insert("agcHubs", {
      name: hub.name,
      region: hub.region,
      country: hub.country,
      active: true,
      createdAt: Date.now(),
    }),
  );
  const repId = await t.run((ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId,
      username: hub.name.toLowerCase().replace(/\s+/g, "_"),
      passwordHash: "not-a-hash",
      profileComplete: true,
      mustChangePassword: false,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return { hubId, repId };
}

type RegSeed = {
  hubId: HubId;
  repId: RepId;
  region: AgcRegion;
  quantity?: number;
  unitPrice?: number;
  currency: "GHS" | "USD";
  paymentStatus:
    | "awaiting_payment"
    | "pending_verification"
    | "correction_requested"
    | "rejected"
    | "confirmed";
  paymentMode?: "offline" | "stripe" | "paypal";
};

function seedRegistration(t: TestConvex, args: RegSeed) {
  return t.run((ctx) =>
    ctx.db.insert("agcRegistrations", {
      hubId: args.hubId,
      repId: args.repId,
      region: args.region,
      quantity: args.quantity ?? 1,
      unitPrice: args.unitPrice ?? 0,
      currency: args.currency,
      totalAmount: (args.quantity ?? 1) * (args.unitPrice ?? 0),
      paymentMode: args.paymentMode ?? "offline",
      paymentStatus: args.paymentStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

type BookingSeed = {
  hubId: HubId;
  repId: RepId;
  region: AgcRegion;
  currency: "GHS" | "USD";
  totalAmount?: number;
  paymentStatus: "awaiting_payment" | "pending_verification" | "confirmed";
  bookingStatus: "reserved" | "pending_verification" | "confirmed";
};

function seedBooking(t: TestConvex, args: BookingSeed) {
  return t.run((ctx) =>
    ctx.db.insert("agcBookings", {
      hubId: args.hubId,
      repId: args.repId,
      region: args.region,
      currency: args.currency,
      totalAmount: args.totalAmount ?? 0,
      paymentMode: "offline",
      paymentStatus: args.paymentStatus,
      bookingStatus: args.bookingStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

test("finance overview shows registration + accommodation money, split per currency", async () => {
  const t = createTestConvex();
  const token = await seedSessionToken(t, "finance", "finance@example.com");

  const accra = await seedHubWithRep(t, {
    name: "Accra Central",
    region: "ghana",
    country: "Ghana",
  });
  const london = await seedHubWithRep(t, {
    name: "London Central",
    region: "england",
    country: "United Kingdom",
  });

  // Registrations: GHS 8,000 confirmed + GHS 2,000 awaiting review.
  await seedRegistration(t, {
    hubId: accra.hubId,
    repId: accra.repId,
    region: "ghana",
    quantity: 4,
    unitPrice: 2_000,
    currency: "GHS",
    paymentStatus: "confirmed",
  });
  await seedRegistration(t, {
    hubId: accra.hubId,
    repId: accra.repId,
    region: "ghana",
    quantity: 2,
    unitPrice: 1_000,
    currency: "GHS",
    paymentStatus: "pending_verification",
  });
  // An unpaid USD submission — must not create any USD registration revenue.
  await seedRegistration(t, {
    hubId: london.hubId,
    repId: london.repId,
    region: "england",
    quantity: 5,
    unitPrice: 400,
    currency: "USD",
    paymentStatus: "awaiting_payment",
  });

  // Bookings: USD 1,200 confirmed + USD 400 reserved hold; GHS 600 awaiting.
  await seedBooking(t, {
    hubId: london.hubId,
    repId: london.repId,
    region: "england",
    currency: "USD",
    totalAmount: 1_200,
    paymentStatus: "confirmed",
    bookingStatus: "confirmed",
  });
  await seedBooking(t, {
    hubId: london.hubId,
    repId: london.repId,
    region: "england",
    currency: "USD",
    totalAmount: 400,
    paymentStatus: "awaiting_payment",
    bookingStatus: "reserved",
  });
  await seedBooking(t, {
    hubId: accra.hubId,
    repId: accra.repId,
    region: "ghana",
    currency: "GHS",
    totalAmount: 600,
    paymentStatus: "pending_verification",
    bookingStatus: "pending_verification",
  });

  const overview = await t.query(api.agcAdminData.getAgcOverview, {
    sessionToken: token,
  });

  expect(overview.financeView).toBe(true);

  // Registration money — per currency, never mixed.
  expect(overview.registrations.revenueByCurrency).toEqual({ GHS: 8_000 });
  expect(overview.registrations.awaitingByCurrency).toEqual({ GHS: 2_000 });
  expect(overview.registrations.revenueLabel).toBe("GHS 8,000");
  expect(overview.registrations.awaitingLabel).toBe("GHS 2,000");

  // Accommodation money — per currency; reserved holds count as awaiting.
  expect(overview.bookings.revenueByCurrency).toEqual({ USD: 1_200 });
  expect(overview.bookings.awaitingByCurrency).toEqual({ GHS: 600, USD: 400 });
  expect(overview.bookings.awaitingLabel).toBe("GHS 600 · USD 400");

  // Status counts arrive for both finance-relevant surfaces.
  expect(overview.registrations.confirmed).toBe(1);
  expect(overview.registrations.pending).toBe(1);
  expect(overview.bookings.confirmed).toBe(1);
  expect(overview.bookings.pending).toBe(2);

  // Finance view hides operational widgets — housing is emptied server-side.
  expect(overview.housing).toEqual([]);
});

test("attention items point at the real review consoles and carry per-currency amounts", async () => {
  const t = createTestConvex();
  const token = await seedSessionToken(t, "finance", "finance2@example.com");

  const accra = await seedHubWithRep(t, {
    name: "Accra Central",
    region: "ghana",
    country: "Ghana",
  });

  await seedRegistration(t, {
    hubId: accra.hubId,
    repId: accra.repId,
    region: "ghana",
    quantity: 1,
    unitPrice: 2_500,
    currency: "GHS",
    paymentStatus: "pending_verification",
  });

  const overview = await t.query(api.agcAdminData.getAgcOverview, {
    sessionToken: token,
  });

  const regAttention = overview.attention.find(
    (item) => item.id === "agc-reg-pending",
  );
  expect(regAttention).toBeDefined();
  expect(regAttention!.href).toBe("/admin/registrations");
  expect(regAttention!.detail).toContain("GHS 2,500");

  // The bookings attention item links to the accommodation console even when
  // there is nothing pending yet (only its presence-with-amounts is asserted
  // in the other test).
  const bookingAttention = overview.attention.find(
    (item) => item.id === "agc-booking-pending",
  );
  if (bookingAttention) {
    expect(bookingAttention.href).toBe("/admin/accommodation");
  }
});

test("finance is scoped away from content, emails and low-capacity items", async () => {
  const t = createTestConvex();
  const token = await seedSessionToken(t, "finance", "finance3@example.com");

  await t.run((ctx) =>
    ctx.db.insert("faqs", {
      category: "General",
      question: "Q?",
      answer: "A",
      order: 1,
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("emailLogs", {
      to: "rep@example.com",
      subject: "s",
      body: "b",
      type: "test",
      status: "failed",
      createdAt: Date.now(),
    }),
  );

  const overview = await t.query(api.agcAdminData.getAgcOverview, {
    sessionToken: token,
  });

  // Content counters are zeroed for finance...
  expect(overview.content).toEqual({ faqs: 0, videos: 0 });
  // ...email counters are zeroed...
  expect(overview.emails).toEqual({
    total: 0,
    pending: 0,
    stub: 0,
    sent: 0,
    failed: 0,
  });
  // ...and attention carries no email items.
  expect(
    overview.attention.some((item) => item.id === "email-failed"),
  ).toBe(false);
});

test("admin keeps the full overview with per-currency revenue labels", async () => {
  const t = createTestConvex();
  const token = await seedSessionToken(t, "admin", "admin@example.com");

  const accra = await seedHubWithRep(t, {
    name: "Accra Central",
    region: "ghana",
    country: "Ghana",
  });
  const london = await seedHubWithRep(t, {
    name: "London Central",
    region: "england",
    country: "United Kingdom",
  });

  await seedRegistration(t, {
    hubId: accra.hubId,
    repId: accra.repId,
    region: "ghana",
    quantity: 2,
    unitPrice: 1_500,
    currency: "GHS",
    paymentStatus: "confirmed",
  });
  await seedRegistration(t, {
    hubId: london.hubId,
    repId: london.repId,
    region: "england",
    quantity: 1,
    unitPrice: 300,
    currency: "USD",
    paymentStatus: "confirmed",
  });

  const overview = await t.query(api.agcAdminData.getAgcOverview, {
    sessionToken: token,
  });

  expect(overview.financeView).toBe(false);
  expect(overview.registrations.revenueLabel).toBe("GHS 3,000 · USD 300");

  // Admin still sees housing capacity once pools exist.
  await t.run((ctx) =>
    ctx.db.insert("agcInventoryPools", {
      accommodationType: "dormitory",
      scope: "africa",
      total: 10,
      reserved: 0,
      confirmed: 0,
    }),
  );
  const refreshed = await t.query(api.agcAdminData.getAgcOverview, {
    sessionToken: token,
  });
  expect(refreshed.housing).toHaveLength(1);
  expect(refreshed.housing[0]).toMatchObject({
    type: "dormitory",
    capacityLimit: 10,
  });
});

test("registration role sees registration money but no accommodation totals", async () => {
  const t = createTestConvex();
  const token = await seedSessionToken(t, "registration", "reg@example.com");

  const accra = await seedHubWithRep(t, {
    name: "Accra Central",
    region: "ghana",
    country: "Ghana",
  });
  const london = await seedHubWithRep(t, {
    name: "London Central",
    region: "england",
    country: "United Kingdom",
  });

  await seedRegistration(t, {
    hubId: accra.hubId,
    repId: accra.repId,
    region: "ghana",
    quantity: 1,
    unitPrice: 1_000,
    currency: "GHS",
    paymentStatus: "confirmed",
  });
  await seedBooking(t, {
    hubId: london.hubId,
    repId: london.repId,
    region: "england",
    currency: "USD",
    totalAmount: 999,
    paymentStatus: "confirmed",
    bookingStatus: "confirmed",
  });

  const overview = await t.query(api.agcAdminData.getAgcOverview, {
    sessionToken: token,
  });

  expect(overview.financeView).toBe(false);
  expect(overview.registrations.revenueLabel).toBe("GHS 1,000");
  // Bookings were never loaded for the registration role.
  expect(overview.bookings.revenueByCurrency).toEqual({});
});

test("finance role is read-only: review and delete mutations reject it", async () => {
  const t = createTestConvex();
  const financeToken = await seedSessionToken(
    t,
    "finance",
    "finance-ro@example.com",
  );
  const adminToken = await seedSessionToken(t, "admin", "admin-ro@example.com");

  const accra = await seedHubWithRep(t, {
    name: "Accra Central",
    region: "ghana",
    country: "Ghana",
  });
  const london = await seedHubWithRep(t, {
    name: "London Central",
    region: "england",
    country: "United Kingdom",
  });

  const registrationId = await seedRegistration(t, {
    hubId: accra.hubId,
    repId: accra.repId,
    region: "ghana",
    quantity: 1,
    unitPrice: 500,
    currency: "GHS",
    paymentStatus: "pending_verification",
  });
  const bookingId = await seedBooking(t, {
    hubId: london.hubId,
    repId: london.repId,
    region: "england",
    currency: "USD",
    totalAmount: 400,
    paymentStatus: "pending_verification",
    bookingStatus: "pending_verification",
  });

  // Finance cannot approve, reject, correct or delete.
  await expect(
    t.mutation(api.agcAdminData.reviewAgcRegistration, {
      sessionToken: financeToken,
      registrationId,
      decision: "approve",
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.agcAdminData.reviewAgcBooking, {
      sessionToken: financeToken,
      bookingId,
      decision: "approve",
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.agcAdminData.deleteAgcRegistration, {
      sessionToken: financeToken,
      registrationId,
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.agcAdminData.deleteAgcBooking, {
      sessionToken: financeToken,
      bookingId,
    }),
  ).rejects.toThrow();

  // Finance keeps read access to both finance tables (the sidebar views).
  const registrations = await t.query(api.agcAdminData.listAgcRegistrationsAdmin, {
    sessionToken: financeToken,
  });
  expect(registrations).toHaveLength(1);
  const bookings = await t.query(api.agcAdminData.listAgcBookingsAdmin, {
    sessionToken: financeToken,
  });
  expect(bookings).toHaveLength(1);

  // The rejected writes changed nothing.
  expect(registrations[0].paymentStatus).toBe("pending_verification");
  expect(bookings[0].paymentStatus).toBe("pending_verification");

  // Admin keeps its review rights — existing behaviour intact.
  await t.mutation(api.agcAdminData.reviewAgcRegistration, {
    sessionToken: adminToken,
    registrationId,
    decision: "approve",
  });
  await t.mutation(api.agcAdminData.reviewAgcBooking, {
    sessionToken: adminToken,
    bookingId,
    decision: "approve",
  });
  const approvedRegs = await t.query(api.agcAdminData.listAgcRegistrationsAdmin, {
    sessionToken: adminToken,
  });
  expect(approvedRegs[0].paymentStatus).toBe("confirmed");
  const approvedBookings = await t.query(api.agcAdminData.listAgcBookingsAdmin, {
    sessionToken: adminToken,
  });
  expect(approvedBookings[0].paymentStatus).toBe("confirmed");
  expect(approvedBookings[0].bookingStatus).toBe("confirmed");
});
