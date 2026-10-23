import { expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Closing a booking retires its guests.
 *
 * A guest row — not a booking — is what the arrival desk searches, room and
 * export. Guests used to outlive the booking that carried them: expiring a
 * hold, cancelling a reservation or rejecting a receipt handed the beds back
 * but left every delegate `active`, so once the hub re-booked the same people
 * there were two live copies and the desk offered both. These tests pin the
 * cascade at each closing path, the room a retired guest gives up, and the
 * desk-side guard that keeps rows left `active` by older releases off the
 * search.
 *
 * The roster is retired, never deleted: the hub still sees its names on the
 * closed booking (that is what the "book these beds again" shortcut re-books).
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedAdminHubRep(t: TestConvex) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  const repToken = "rep-session-token";
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
      name: "Laikos International Church",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: Date.now(),
    });
    const repId: Id<"agcRepresentatives"> = await ctx.db.insert(
      "agcRepresentatives",
      {
        hubId,
        username: "laikos",
        passwordHash: "not-a-hash",
        profileComplete: true,
        mustChangePassword: false,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    );
    await ctx.db.insert("agcRepSessions", {
      repId,
      token: repToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
    return { hubId, repId };
  });
  return { token, repToken, ...ids };
}

type SeedBookingArgs = {
  hubId: Id<"agcHubs">;
  repId: Id<"agcRepresentatives">;
  referenceNumber: string;
  bookingStatus: "reserved" | "confirmed" | "expired" | "cancelled";
  paymentStatus:
    | "awaiting_payment"
    | "pending_verification"
    | "confirmed"
    | "rejected";
  expiresAt?: number;
  guests: Array<{ title: string; firstName: string; lastName: string; gender: "male" | "female" }>;
  accommodationType?: "dormitory" | "hostel";
  guestStatus?: "active" | "cancelled";
};

/** One booking with a roster and the bed line behind it. */
async function seedBooking(t: TestConvex, args: SeedBookingArgs) {
  const now = Date.now();
  const type = args.accommodationType ?? "dormitory";
  return await t.run(async (ctx) => {
    const bookingId: Id<"agcBookings"> = await ctx.db.insert("agcBookings", {
      hubId: args.hubId,
      repId: args.repId,
      region: "ghana",
      currency: "GHS",
      totalAmount: args.guests.length * 150,
      paymentMode: "offline",
      paymentStatus: args.paymentStatus,
      bookingStatus: args.bookingStatus,
      expiresAt: args.expiresAt,
      referenceNumber: args.referenceNumber,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("agcBookingLines", {
      bookingId,
      accommodationType: type,
      quantity: args.guests.length,
      unitPrice: 150,
      isBishopRate: false,
    });
    const guestIds: Id<"agcGuests">[] = [];
    for (const guest of args.guests) {
      guestIds.push(
        await ctx.db.insert("agcGuests", {
          bookingId,
          hubId: args.hubId,
          region: "ghana",
          country: "Ghana",
          firstName: guest.firstName,
          lastName: guest.lastName,
          gender: guest.gender,
          title: guest.title,
          accommodationType: type,
          pool: "africa",
          isBishopRate: false,
          status: args.guestStatus ?? "active",
          createdAt: now,
        }),
      );
    }
    return { bookingId, guestIds };
  });
}

test("the expiry sweep retires a lapsed hold's delegates and the desk searches them once", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminHubRep(t);
  const now = Date.now();

  const roster = [
    { title: "Member", firstName: "Chelsea", lastName: "Agyiri", gender: "female" as const },
    { title: "Pastor", firstName: "Nana", lastName: "Agyiri", gender: "male" as const },
  ];
  // The hold the desk will expire, with the same two people on it.
  const lapsed = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC61843",
    bookingStatus: "reserved",
    paymentStatus: "awaiting_payment",
    expiresAt: now - 60_000,
    guests: roster,
  });
  // The hub's re-book of the same two people, still live.
  const live = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC82752",
    bookingStatus: "confirmed",
    paymentStatus: "confirmed",
    guests: roster,
  });

  // Before the sweep both copies are on the desk — the duplicate the operator
  // sees on screen.
  const before = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: token,
    search: "agyiri",
  });
  expect(before.map((row) => row.bookingRef).sort()).toEqual([
    "HC61843",
    "HC61843",
    "HC82752",
    "HC82752",
  ]);

  const tick = await t.mutation(internal.crons.expireHoldsTick, {});
  expect(tick.expired).toBe(1);

  const after = await t.run(async (ctx) => ({
    lapsedBooking: await ctx.db.get(lapsed.bookingId),
    lapsedGuests: await Promise.all(lapsed.guestIds.map((id) => ctx.db.get(id))),
    liveGuests: await Promise.all(live.guestIds.map((id) => ctx.db.get(id))),
  }));
  expect(after.lapsedBooking?.bookingStatus).toBe("expired");
  // The dead hold keeps its roster for the re-book shortcut, but no longer
  // claims those people are staying.
  expect(after.lapsedGuests.map((guest) => guest?.status)).toEqual([
    "cancelled",
    "cancelled",
  ]);
  expect(after.liveGuests.map((guest) => guest?.status)).toEqual([
    "active",
    "active",
  ]);

  // One copy of each delegate on the search, from the live booking only.
  const search = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: token,
    search: "agyiri",
  });
  expect(search.map((row) => row.bookingRef)).toEqual(["HC82752", "HC82752"]);
});

test("a hub cancelling a reservation retires its delegates but keeps their names", async () => {
  const t = createTestConvex();
  const { token, repToken, hubId, repId } = await seedAdminHubRep(t);

  const seeded = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC-CANCEL",
    bookingStatus: "reserved",
    paymentStatus: "awaiting_payment",
    expiresAt: Date.now() + 3_600_000,
    guests: [
      { title: "Rev.", firstName: "Alphonse", lastName: "Asare", gender: "male" },
      { title: "Pastor", firstName: "Lydia", lastName: "Boateng", gender: "female" },
    ],
  });

  await t.mutation(api.agcBookings.cancelBooking, {
    sessionToken: repToken,
    bookingId: seeded.bookingId,
  });

  const guests = await t.run(async (ctx) =>
    Promise.all(seeded.guestIds.map((id) => ctx.db.get(id))),
  );
  expect(guests.map((guest) => guest?.status)).toEqual(["cancelled", "cancelled"]);

  // Off the desk…
  const search = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: token,
    search: "asare",
  });
  expect(search).toHaveLength(0);

  // …but still on the hub's own record, which is what a re-book pre-fills.
  const bookings = await t.query(api.agcBookings.listRepBookings, {
    sessionToken: repToken,
  });
  const cancelled = bookings.find((row) => row.referenceNumber === "HC-CANCEL");
  expect(cancelled?.guests.map((guest) => guest.lastName).sort()).toEqual([
    "Asare",
    "Boateng",
  ]);
});

test("rejecting a receipt retires the delegates and frees the room they were given", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminHubRep(t);

  const seeded = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC-REJECT",
    bookingStatus: "reserved",
    paymentStatus: "pending_verification",
    expiresAt: Date.now() + 3_600_000,
    guests: [
      { title: "Pastor", firstName: "Maurice", lastName: "Duncan", gender: "male" },
    ],
  });

  const assignmentId = await t.run(async (ctx) => {
    const roomId = await ctx.db.insert("agcRooms", {
      accommodationType: "dormitory",
      name: "Dorm 7",
      building: "Blocks 1–4",
      capacity: 4,
    });
    return await ctx.db.insert("agcRoomAssignments", {
      roomId,
      guestId: seeded.guestIds[0],
      bookingId: seeded.bookingId,
      assignedBy: "seed",
      createdAt: Date.now(),
    });
  });

  await t.mutation(api.agcAdminData.reviewAgcBooking, {
    sessionToken: token,
    bookingId: seeded.bookingId,
    decision: "reject",
    message: "Receipt does not match the amount.",
  });

  const after = await t.run(async (ctx) => ({
    booking: await ctx.db.get(seeded.bookingId),
    guest: await ctx.db.get(seeded.guestIds[0]),
    assignment: await ctx.db.get(assignmentId),
  }));
  expect(after.booking?.bookingStatus).toBe("cancelled");
  expect(after.guest?.status).toBe("cancelled");
  // A retired guest cannot keep holding a bed.
  expect(after.assignment?.endedAt).toBeTypeOf("number");
  expect(after.assignment?.endReason).toBe("Booking cancelled");

  const search = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: token,
    search: "duncan",
  });
  expect(search).toHaveLength(0);
});

test("the one-off backfill retires rosters left live on closed bookings, a page at a time", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminHubRep(t);

  const roster = [
    { title: "Member", firstName: "Isaac", lastName: "Mensah", gender: "male" as const },
    { title: "Member", firstName: "Clifford", lastName: "Sarpong", gender: "male" as const },
  ];
  // Two holds released by older code: beds back, people still `active`.
  const expired = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC-OLD-EXPIRED",
    bookingStatus: "expired",
    paymentStatus: "awaiting_payment",
    guests: roster,
  });
  const cancelled = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC-OLD-CANCELLED",
    bookingStatus: "cancelled",
    paymentStatus: "rejected",
    guests: roster,
  });
  // And one still live: the backfill must leave it alone.
  const live = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC-LIVE",
    bookingStatus: "confirmed",
    paymentStatus: "confirmed",
    guests: roster,
  });

  // Pages are bounded, so the sweep is safe to run against live data and can
  // be resumed: follow the cursor until it reports done.
  let scanned = 0;
  let bookings = 0;
  let guests = 0;
  let result = await t.mutation(internal.crons.backfillRetiredGuests, {
    pageSize: 2,
  });
  for (;;) {
    expect(result.scanned).toBeLessThanOrEqual(2);
    scanned += result.scanned;
    bookings += result.bookings;
    guests += result.guests;
    if (result.isDone) break;
    result = await t.mutation(internal.crons.backfillRetiredGuests, {
      cursor: result.cursor,
      pageSize: 2,
    });
  }
  expect(scanned).toBe(3); // every booking, live one included
  expect(bookings).toBe(2); // only the two released holds had work to do
  expect(guests).toBe(4);

  const after = await t.run(async (ctx) => ({
    expired: await Promise.all(expired.guestIds.map((id) => ctx.db.get(id))),
    cancelled: await Promise.all(cancelled.guestIds.map((id) => ctx.db.get(id))),
    live: await Promise.all(live.guestIds.map((id) => ctx.db.get(id))),
  }));
  expect(after.expired.map((guest) => guest?.status)).toEqual([
    "cancelled",
    "cancelled",
  ]);
  expect(after.cancelled.map((guest) => guest?.status)).toEqual([
    "cancelled",
    "cancelled",
  ]);
  // The confirmed booking keeps its delegates.
  expect(after.live.map((guest) => guest?.status)).toEqual(["active", "active"]);

  // Nothing live on the desk; the metrics and the guest export see 2 delegates.
  const search = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: token,
    search: "mensah",
  });
  expect(search.map((row) => row.bookingRef)).toEqual(["HC-LIVE"]);
  const metrics = await t.query(api.agcAdminData.getAgcMetrics, {
    sessionToken: token,
  });
  expect(metrics.bookings.activeGuests).toBe(2);

  // Idempotent: a second full pass retires nobody.
  let again = await t.mutation(internal.crons.backfillRetiredGuests, {
    pageSize: 50,
  });
  expect(again.guests).toBe(0);
  while (!again.isDone) {
    again = await t.mutation(internal.crons.backfillRetiredGuests, {
      cursor: again.cursor,
      pageSize: 50,
    });
    expect(again.guests).toBe(0);
  }
});

test("the desk search ignores delegates left live on a closed or trashed booking", async () => {
  const t = createTestConvex();
  const { token, hubId, repId } = await seedAdminHubRep(t);

  // Rows the old release paths left `active` on a hold they no longer own.
  const legacy = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC-LEGACY",
    bookingStatus: "expired",
    paymentStatus: "awaiting_payment",
    guests: [
      { title: "Member", firstName: "Isaac", lastName: "Mensah", gender: "male" },
    ],
  });
  // And the same shape on a trashed booking.
  const trashed = await seedBooking(t, {
    hubId,
    repId,
    referenceNumber: "HC-TRASHED",
    bookingStatus: "reserved",
    paymentStatus: "awaiting_payment",
    guests: [
      { title: "Member", firstName: "Isaac", lastName: "Mensah", gender: "male" },
    ],
  });
  await t.run((ctx) => ctx.db.patch(trashed.bookingId, { deletedAt: Date.now() }));

  const search = await t.query(api.agcCheckin.searchDelegates, {
    sessionToken: token,
    search: "mensah",
  });
  expect(search).toHaveLength(0);
  expect(legacy.guestIds.length + trashed.guestIds.length).toBe(2);
});
