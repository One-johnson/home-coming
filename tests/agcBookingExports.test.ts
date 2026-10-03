import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { AgcRegion } from "../convex/schemaTypes";
import { createTestConvex } from "./testUtils";

/**
 * Accommodation Excel exports — the admin workbook spans every hub and the
 * rep workbook covers the rep's own hub. Both must open on a guest list that
 * carries each guest's name, gender and accommodation type, plus the hub that
 * owns them, so the files work as rooming lists.
 *
 * Seeding mirrors tests/agcAuth.test.ts: admin users/sessions for the admin
 * actions, and a rep + agcRepSessions row for the rep action.
 */

type TestConvex = ReturnType<typeof createTestConvex>;
type HubId = Id<"agcHubs">;
type RepId = Id<"agcRepresentatives">;
type BookingId = Id<"agcBookings">;

async function seedAdminToken(t: TestConvex): Promise<string> {
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
      passwordHash: "not-a-real-hash",
      profileComplete: true,
      mustChangePassword: false,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return { hubId, repId };
}

type GuestSeed = {
  title: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  accommodationType:
    | "dormitory"
    | "hostel"
    | "wise_serpents"
    | "good_general"
    | "ebpv";
  pool: "africa" | "rest_of_world";
  country: string;
};

async function seedBooking(
  t: TestConvex,
  args: {
    hubId: HubId;
    repId: RepId;
    region: AgcRegion;
    referenceNumber: string;
    guests: GuestSeed[];
  },
): Promise<BookingId> {
  return t.run(async (ctx) => {
    const bookingId = await ctx.db.insert("agcBookings", {
      hubId: args.hubId,
      repId: args.repId,
      region: args.region,
      currency: args.region === "ghana" ? "GHS" : "USD",
      totalAmount: 500,
      paymentMode: "offline",
      paymentStatus: "pending_verification",
      bookingStatus: "pending_verification",
      referenceNumber: args.referenceNumber,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    for (const guest of args.guests) {
      await ctx.db.insert("agcGuests", {
        bookingId,
        hubId: args.hubId,
        region: args.region,
        country: guest.country,
        firstName: guest.firstName,
        lastName: guest.lastName,
        gender: guest.gender,
        title: guest.title,
        accommodationType: guest.accommodationType,
        pool: guest.pool,
        isBishopRate: false,
        status: "active",
        createdAt: Date.now(),
      });
    }
    return bookingId;
  });
}

async function loadWorkbook(result: {
  contentBase64: string;
}): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(result.contentBase64, "base64") as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0],
  );
  return workbook;
}

/** Read a worksheet as header→value records (row 1 holds the headers). */
function sheetRecords(sheet: ExcelJS.Worksheet): Array<Record<string, string>> {
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, column) => {
    headers[column] = String(cell.value ?? "").trim();
  });
  const rows: Array<Record<string, string>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (!header) return;
      record[header] = String(row.getCell(column).value ?? "");
    });
    rows.push(record);
  });
  return rows;
}

test("admin accommodation export opens on all hubs' guests with name, gender and accommodation type", async () => {
  const t = createTestConvex();
  const adminToken = await seedAdminToken(t);

  const ghana = await seedHubWithRep(t, {
    name: "Accra Central",
    region: "ghana",
    country: "Ghana",
  });
  const england = await seedHubWithRep(t, {
    name: "London Central",
    region: "england",
    country: "United Kingdom",
  });

  await seedBooking(t, {
    hubId: ghana.hubId,
    repId: ghana.repId,
    region: "ghana",
    referenceNumber: "HC-ACC-001",
    guests: [
      {
        title: "Mr.",
        firstName: "Kwame",
        lastName: "Mensah",
        gender: "male",
        accommodationType: "dormitory",
        pool: "africa",
        country: "Ghana",
      },
      {
        title: "Mrs.",
        firstName: "Ama",
        lastName: "Owusu",
        gender: "female",
        accommodationType: "hostel",
        pool: "africa",
        country: "Ghana",
      },
    ],
  });
  await seedBooking(t, {
    hubId: england.hubId,
    repId: england.repId,
    region: "england",
    referenceNumber: "HC-ACC-002",
    guests: [
      {
        title: "Ms.",
        firstName: "Jane",
        lastName: "Smith",
        gender: "female",
        accommodationType: "wise_serpents",
        pool: "rest_of_world",
        country: "United Kingdom",
      },
    ],
  });

  const result = await t.action(api.agcExcel.exportBookingsExcel, {
    sessionToken: adminToken,
  });
  expect(result.filename).toMatch(
    /^homecoming-2026-bookings-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  const workbook = await loadWorkbook(result);
  // The guest list opens first — that is the rooming-list surface.
  expect(workbook.worksheets[0].name).toBe("Guests");

  const guests = sheetRecords(workbook.getWorksheet("Guests")!);
  expect(guests).toHaveLength(3);
  expect(guests[0]).toMatchObject({
    "Booking Reference": "HC-ACC-001",
    Hub: "Accra Central",
    Title: "Mr.",
    "First Name": "Kwame",
    "Last Name": "Mensah",
    Gender: "male",
    "Accommodation Type": "dormitory",
  });

  // Every hub is represented, with gender + type intact.
  expect(guests.map((guest) => guest.Hub)).toEqual([
    "Accra Central",
    "Accra Central",
    "London Central",
  ]);
  expect(guests.find((guest) => guest["Last Name"] === "Smith")).toMatchObject({
    Hub: "London Central",
    Gender: "female",
    "Accommodation Type": "wise_serpents",
  });
  expect(
    guests.find((guest) => guest["Last Name"] === "Owusu"),
  ).toMatchObject({ Gender: "female", "Accommodation Type": "hostel" });

  // One sheet per hub follows, each holding only that hub's guests.
  const accraSheet = workbook.getWorksheet("Accra Central");
  expect(accraSheet).toBeDefined();
  expect(
    sheetRecords(accraSheet!).map((guest) => guest["Last Name"]),
  ).toEqual(["Mensah", "Owusu"]);

  const londonSheet = workbook.getWorksheet("London Central");
  expect(londonSheet).toBeDefined();
  expect(sheetRecords(londonSheet!).map((guest) => guest["Last Name"])).toEqual(
    ["Smith"],
  );

  // The booking-level summary sheet is still exported alongside them.
  const bookings = sheetRecords(workbook.getWorksheet("Bookings")!);
  expect(bookings.map((row) => row.Reference).sort()).toEqual([
    "HC-ACC-001",
    "HC-ACC-002",
  ]);
});

test("per-hub sheets sanitize hub names for Excel, stay unique and cap at 31 characters", async () => {
  const t = createTestConvex();
  const adminToken = await seedAdminToken(t);

  const plainHub = await seedHubWithRep(t, {
    name: "Alpha Beta Central",
    region: "ghana",
    country: "Ghana",
  });
  const slashedHub = await seedHubWithRep(t, {
    name: "Alpha/Beta Central",
    region: "ghana",
    country: "Ghana",
  });
  const longHub = await seedHubWithRep(t, {
    name: "North America Delegates Coordinating Hub",
    region: "north_america",
    country: "United States",
  });

  const ownGuest = (firstName: string, lastName: string): GuestSeed => ({
    title: "Mr.",
    firstName,
    lastName,
    gender: "male",
    accommodationType: "dormitory",
    pool: "africa",
    country: "Ghana",
  });

  await seedBooking(t, {
    hubId: plainHub.hubId,
    repId: plainHub.repId,
    region: "ghana",
    referenceNumber: "HC-NAME-001",
    guests: [ownGuest("One", "Plain")],
  });
  await seedBooking(t, {
    hubId: slashedHub.hubId,
    repId: slashedHub.repId,
    region: "ghana",
    referenceNumber: "HC-NAME-002",
    guests: [ownGuest("Two", "Slash"), ownGuest("Three", "Slash")],
  });
  await seedBooking(t, {
    hubId: longHub.hubId,
    repId: longHub.repId,
    region: "north_america",
    referenceNumber: "HC-NAME-003",
    guests: [
      {
        title: "Ms.",
        firstName: "Four",
        lastName: "Longname",
        gender: "female",
        accommodationType: "hostel",
        pool: "rest_of_world",
        country: "United States",
      },
    ],
  });

  const result = await t.action(api.agcExcel.exportBookingsExcel, {
    sessionToken: adminToken,
  });
  const workbook = await loadWorkbook(result);
  const names = workbook.worksheets.map((worksheet) => worksheet.name);

  expect(names).toContain("Guests");
  expect(names).toContain("Bookings");
  // "Alpha Beta Central" and "Alpha/Beta Central" collapse to the same safe
  // name, so one keeps it and the other gets a numeric suffix.
  const alphaSheets = names.filter((name) =>
    name.startsWith("Alpha Beta Central"),
  );
  expect(new Set(alphaSheets).size).toBe(2);
  expect(
    alphaSheets
      .map(
        (name) => sheetRecords(workbook.getWorksheet(name)!).length,
      )
      .sort(),
  ).toEqual([1, 2]);

  // Excel caps sheet names at 31 characters.
  const longSheet = names.find((name) =>
    name.startsWith("North America Delegates"),
  );
  expect(longSheet).toBeDefined();
  expect(longSheet!.length).toBeLessThanOrEqual(31);
  expect(sheetRecords(workbook.getWorksheet(longSheet!)!)).toHaveLength(1);
});

test("rep accommodation export opens on the hub's guests with name, gender and accommodation type", async () => {
  const t = createTestConvex();

  const ownHub = await seedHubWithRep(t, {
    name: "Kumasi Central",
    region: "ghana",
    country: "Ghana",
  });
  const otherHub = await seedHubWithRep(t, {
    name: "Bern Central",
    region: "switzerland",
    country: "Switzerland",
  });

  await seedBooking(t, {
    hubId: ownHub.hubId,
    repId: ownHub.repId,
    region: "ghana",
    referenceNumber: "HC-REP-001",
    guests: [
      {
        title: "Pastor",
        firstName: "Yaw",
        lastName: "Asante",
        gender: "male",
        accommodationType: "ebpv",
        pool: "africa",
        country: "Ghana",
      },
      {
        title: "Miss",
        firstName: "Efua",
        lastName: "Boateng",
        gender: "female",
        accommodationType: "dormitory",
        pool: "africa",
        country: "Ghana",
      },
    ],
  });
  // Another hub's booking must never leak into this rep's workbook.
  await seedBooking(t, {
    hubId: otherHub.hubId,
    repId: otherHub.repId,
    region: "switzerland",
    referenceNumber: "HC-REP-999",
    guests: [
      {
        title: "Mr.",
        firstName: "Hans",
        lastName: "Muller",
        gender: "male",
        accommodationType: "hostel",
        pool: "rest_of_world",
        country: "Switzerland",
      },
    ],
  });

  const repToken = "rep-session-token-1";
  await t.run((ctx) =>
    ctx.db.insert("agcRepSessions", {
      repId: ownHub.repId,
      token: repToken,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    }),
  );

  const result = await t.action(api.agcExcel.exportRepBookingsExcel, {
    sessionToken: repToken,
  });
  expect(result.filename).toMatch(
    /^homecoming-2026-accommodation-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  const workbook = await loadWorkbook(result);
  expect(workbook.worksheets[0].name).toBe("Guests");

  const guests = sheetRecords(workbook.getWorksheet("Guests")!);
  expect(guests).toHaveLength(2);
  const asante = guests.find((guest) => guest["Last Name"] === "Asante");
  expect(asante).toMatchObject({
    "Booking Reference": "HC-REP-001",
    Hub: "Kumasi Central",
    "First Name": "Yaw",
    Gender: "male",
    "Accommodation Type": "ebpv",
    "Booking Status": "pending_verification",
    "Payment Status": "pending_verification",
  });
  expect(guests.find((guest) => guest["Last Name"] === "Boateng")).toMatchObject(
    { Gender: "female", "Accommodation Type": "dormitory" },
  );
  expect(guests.some((guest) => guest["Last Name"] === "Muller")).toBe(false);

  // Rep scoping is enforced by the session, not the payload.
  await expect(
    t.action(api.agcExcel.exportRepBookingsExcel, {
      sessionToken: "not-a-rep-session",
    }),
  ).rejects.toThrow();
});
