"use node";

import ExcelJS from "exceljs";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { AGC_ACCOMMODATION_TYPE_KEYS } from "./lib/agcConfig";
import type {
  AgcAccommodationType,
  AgcGender,
} from "./schemaTypes";

// ------------------------------------------------------------------
// Row parsing — pure helpers, safe to use inside node actions
// ------------------------------------------------------------------

export type ParsedGuestRow = {
  rowNumber: number;
  title: string;
  firstName: string;
  lastName: string;
  gender: AgcGender;
  accommodationType: AgcAccommodationType;
  isBishopRate: boolean;
};

type RawRow = Record<string, unknown>;

function normalizeType(raw: string): AgcAccommodationType | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (!value) return null;
  const direct = AGC_ACCOMMODATION_TYPE_KEYS.find((key) => key === value);
  if (direct) return direct;
  if (value.includes("dorm")) return "dormitory";
  if (value.includes("hostel")) return "hostel";
  if (value.includes("serpent")) return "wise_serpents";
  if (value.includes("general")) return "good_general";
  if (value.includes("ebpv")) return "ebpv";
  return null;
}

function normalizeGender(raw: string): AgcGender | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === "m" || value.startsWith("male")) return "male";
  if (value === "f" || value.startsWith("female")) return "female";
  return null;
}

function normalizeBishop(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === "yes" || value === "true" || value === "1" || value === "y";
}

export function parseGuestRows(
  rows: RawRow[],
  sheetName = "Guests",
): { rows: ParsedGuestRow[]; errors: string[] } {
  const parsed: ParsedGuestRow[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header occupies row 1
    const get = (...names: string[]) => {
      for (const name of names) {
        const value = row[name];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return String(value).trim();
        }
      }
      return "";
    };

    const firstName = get("firstName", "first name", "First Name", "Firstname");
    const lastName = get("lastName", "last name", "Last Name", "Surname");
    const title = get("title", "Title");
    const genderRaw = get("gender", "Gender");
    const typeRaw = get(
      "accommodationType",
      "accommodation type",
      "Accommodation Type",
      "Type",
    );
    const bishopRaw = get("bishopRate", "bishop rate", "Bishop Rate");

    if (!firstName && !lastName && !genderRaw && !typeRaw) {
      return; // fully blank row
    }

    const gender = normalizeGender(genderRaw);
    if (!gender) {
      errors.push(
        `${sheetName} row ${rowNumber}: gender must be male or female`,
      );
      return;
    }

    if (!firstName || !lastName) {
      errors.push(
        `${sheetName} row ${rowNumber}: first name and last name are required`,
      );
      return;
    }

    const accommodationType = normalizeType(typeRaw);
    if (!accommodationType) {
      errors.push(
        `${sheetName} row ${rowNumber}: unknown accommodation type "${typeRaw}" (expected one of: ${AGC_ACCOMMODATION_TYPE_KEYS.join(", ")})`,
      );
      return;
    }

    parsed.push({
      rowNumber,
      title: title || "Member",
      firstName,
      lastName,
      gender,
      accommodationType,
      isBishopRate: normalizeBishop(bishopRaw),
    });
  });

  return { rows: parsed, errors };
}

/** Convert an ExcelJS worksheet into plain header→value rows. */
function worksheetToRows(sheet: ExcelJS.Worksheet): RawRow[] {
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: RawRow = {};
    let hasValue = false;
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const value = row.getCell(colNumber).value;
      const text =
        value !== null && value !== undefined && typeof value !== "object"
          ? String(value)
          : "";
      record[header] = text;
      if (text) hasValue = true;
    });
    if (hasValue) rows.push(record);
  });
  return rows;
}

// ------------------------------------------------------------------
// Template workbook
// ------------------------------------------------------------------

function buildTemplateWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Guests");
  sheet.columns = [
    { header: "Title", key: "title", width: 12 },
    { header: "First Name", key: "firstName", width: 20 },
    { header: "Last Name", key: "lastName", width: 20 },
    { header: "Gender", key: "gender", width: 12 },
    { header: "Accommodation Type", key: "accommodationType", width: 24 },
    { header: "Bishop Rate", key: "bishopRate", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    title: "Bishop",
    firstName: "Example",
    lastName: "Delegate",
    gender: "male",
    accommodationType: "ebpv",
    bishopRate: "yes",
  });
  sheet.addRow({
    title: "Member",
    firstName: "Example",
    lastName: "Delegate",
    gender: "female",
    accommodationType: "dormitory",
    bishopRate: "no",
  });
  sheet.autoFilter = { from: "A1", to: "F1" };

  const guide = workbook.addWorksheet("Instructions");
  guide.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Allowed values", key: "values", width: 72 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRow({
    field: "Title",
    values: "Free text (e.g. Bishop, Pastor, Mr., Mrs.)",
  });
  guide.addRow({ field: "First Name", values: "Required" });
  guide.addRow({ field: "Last Name", values: "Required" });
  guide.addRow({ field: "Gender", values: "male | female" });
  guide.addRow({
    field: "Accommodation Type",
    values: AGC_ACCOMMODATION_TYPE_KEYS.join(" | "),
  });
  guide.addRow({
    field: "Bishop Rate",
    values: "yes | no (EBPV apartments only)",
  });
  guide.addRow({
    field: "Rooms",
    values:
      "Wise as Serpents, Good General and EBPV are priced per room for 2 guests — list each guest on their own row.",
  });

  return workbook;
}

export const downloadBookingTemplate = action({
  args: { sessionToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ filename: string; contentBase64: string }> => {
    const session = await ctx.runQuery(internal.agcAuthData.getRepBySession, {
      token: args.sessionToken,
    });
    if (!session || session.status === "disabled") {
      throw new Error("Unauthorized");
    }

    const workbook = buildTemplateWorkbook();
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename: "homecoming-2026-accommodation-template.xlsx",
      contentBase64: Buffer.from(buffer as ArrayBuffer).toString("base64"),
    };
  },
});

// ------------------------------------------------------------------
// Excel upload → one booking (SRS §21). Parsing here; the booking is
// created inside an internal mutation so inventory writes stay atomic.
// ------------------------------------------------------------------

export const createBookingFromExcel = action({
  args: {
    sessionToken: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    bookingId: string;
    referenceNumber: string;
    totalAmount: number;
    currency: string;
    guestCount: number;
    errors: string[];
  }> => {
    const session = await ctx.runQuery(internal.agcAuthData.getRepBySession, {
      token: args.sessionToken,
    });
    if (!session || session.status === "disabled") {
      throw new Error("Unauthorized");
    }

    const file = await ctx.storage.get(args.storageId);
    if (!file) throw new Error("Uploaded file not found");
    const bytes = Buffer.from(await file.arrayBuffer());

    const workbook = new ExcelJS.Workbook();
    // exceljs declares its own narrower Buffer type; the Node buffer satisfies
    // it at runtime, so bridge the type mismatch here.
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("The workbook has no sheets");

    const { rows, errors } = parseGuestRows(worksheetToRows(sheet));
    if (rows.length === 0) {
      throw new Error(
        errors.length > 0
          ? `No valid rows found. ${errors.join(" ")}`
          : "No guest rows found in the uploaded file",
      );
    }

    const result = await ctx.runMutation(
      internal.agcBookings.createBookingFromExcelInternal,
      {
        sessionToken: args.sessionToken,
        guests: rows.map((row) => ({
          firstName: row.firstName,
          lastName: row.lastName,
          gender: row.gender,
          title: row.title,
          accommodationType: row.accommodationType,
          isBishopRate: row.isBishopRate,
        })),
        rowErrors: errors,
      },
    );
    return result;
  },
});

// ------------------------------------------------------------------
// Admin exports (SRS §61) — data via internal queries, workbook here
// ------------------------------------------------------------------

type BookingExportRow = {
  booking: {
    _id: string;
    referenceNumber: string | undefined;
    region: string;
    bookingStatus: string;
    paymentStatus: string;
    paymentMode: string;
    totalAmount: number;
    currency: string;
    expiresAt: number | undefined;
    createdAt: number;
    hubName: string;
  };
  guests: Array<{
    title: string;
    firstName: string;
    lastName: string;
    gender: string;
    accommodationType: string;
    pool: string;
    isBishopRate: boolean;
    status: string;
    country: string;
  }>;
};

function addBookingSheets(
  workbook: ExcelJS.Workbook,
  entries: BookingExportRow[],
) {
  const sheet = workbook.addWorksheet("Bookings");
  sheet.columns = [
    { header: "Reference", key: "reference", width: 14 },
    { header: "Hub", key: "hub", width: 28 },
    { header: "Region", key: "region", width: 18 },
    { header: "Status", key: "status", width: 20 },
    { header: "Payment", key: "payment", width: 20 },
    { header: "Mode", key: "mode", width: 12 },
    { header: "Total", key: "total", width: 12 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Guests", key: "guests", width: 10 },
    { header: "Expires At", key: "expiresAt", width: 24 },
    { header: "Created At", key: "createdAt", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const entry of entries) {
    sheet.addRow({
      reference: entry.booking.referenceNumber ?? "",
      hub: entry.booking.hubName,
      region: entry.booking.region,
      status: entry.booking.bookingStatus,
      payment: entry.booking.paymentStatus,
      mode: entry.booking.paymentMode,
      total: entry.booking.totalAmount,
      currency: entry.booking.currency,
      guests: entry.guests.filter((g) => g.status === "active").length,
      expiresAt: entry.booking.expiresAt
        ? new Date(entry.booking.expiresAt).toISOString()
        : "",
      createdAt: new Date(entry.booking.createdAt).toISOString(),
    });
  }
  sheet.autoFilter = { from: "A1", to: "K1" };

  const guestSheet = workbook.addWorksheet("Guests");
  guestSheet.columns = [
    { header: "Booking Reference", key: "reference", width: 16 },
    { header: "Title", key: "title", width: 10 },
    { header: "First Name", key: "firstName", width: 20 },
    { header: "Last Name", key: "lastName", width: 20 },
    { header: "Gender", key: "gender", width: 10 },
    { header: "Type", key: "type", width: 18 },
    { header: "Pool", key: "pool", width: 14 },
    { header: "Bishop Rate", key: "bishop", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Country", key: "country", width: 16 },
  ];
  guestSheet.getRow(1).font = { bold: true };
  for (const entry of entries) {
    for (const guest of entry.guests) {
      guestSheet.addRow({
        reference: entry.booking.referenceNumber ?? "",
        title: guest.title,
        firstName: guest.firstName,
        lastName: guest.lastName,
        gender: guest.gender,
        type: guest.accommodationType,
        pool: guest.pool,
        bishop: guest.isBishopRate ? "yes" : "no",
        status: guest.status,
        country: guest.country,
      });
    }
  }
  guestSheet.autoFilter = { from: "A1", to: "J1" };
}

export const exportBookingsExcel = action({
  args: { sessionToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ filename: string; contentBase64: string }> => {
    await ctx.runQuery(internal.agcAdminData.requireAdminSession, {
      sessionToken: args.sessionToken,
    });

    const entries: BookingExportRow[] = await ctx.runQuery(
      internal.agcAdminData.listBookingExportData,
      {},
    );

    const workbook = new ExcelJS.Workbook();
    addBookingSheets(workbook, entries);
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `homecoming-2026-bookings-${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentBase64: Buffer.from(buffer as ArrayBuffer).toString("base64"),
    };
  },
});

export const exportRepsExcel = action({
  args: { sessionToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ filename: string; contentBase64: string }> => {
    await ctx.runQuery(internal.agcAdminData.requireAdminSession, {
      sessionToken: args.sessionToken,
    });

    const reps: Array<{
      username: string;
      hubName: string;
      email: string | null;
      status: string;
      tempPassword: string | null;
      createdAt: number;
    }> = await ctx.runQuery(api.agcAdminData.listReps, {
      sessionToken: args.sessionToken,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Representatives");
    sheet.columns = [
      { header: "Username", key: "username", width: 26 },
      { header: "Hub", key: "hub", width: 32 },
      { header: "Password", key: "password", width: 20 },
      { header: "Email", key: "email", width: 28 },
      { header: "Status", key: "status", width: 16 },
      { header: "Created At", key: "createdAt", width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const rep of reps) {
      sheet.addRow({
        username: rep.username,
        hub: rep.hubName,
        // The temp password is only available while the account is still
        // pending setup; activated reps keep their own private password.
        password:
          rep.status === "pending_setup" ? (rep.tempPassword ?? "") : "",
        email: rep.email ?? "",
        status: rep.status,
        createdAt: new Date(rep.createdAt).toISOString(),
      });
    }
    sheet.autoFilter = { from: "A1", to: "F1" };

    const instructions = workbook.addWorksheet("How to use");
    instructions.getColumn("A").width = 100;
    instructions.addRow([
      "Homecoming 2026 — AGC representative accounts",
    ]).font = { bold: true };
    instructions.addRow([""]);
    instructions.addRow([
      "The username is the hub name in lowercase with spaces replaced by underscores (e.g. Ashanti Mampong → ashanti_mampong).",
    ]);
    instructions.addRow([
      'The password column holds the temporary password for accounts still in "pending setup". It stops working once the rep completes first-time setup.',
    ]);
    instructions.addRow([
      "Reps sign in at /portal with their username and temporary password, complete first-time setup, then sign in with their new password.",
    ]);
    instructions.addRow([
      "Keep this file secure — it grants access to the representative portal.",
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `homecoming-2026-representatives-${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentBase64: Buffer.from(buffer as ArrayBuffer).toString("base64"),
    };
  },
});

export const exportRegistrationsExcel = action({
  args: { sessionToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ filename: string; contentBase64: string }> => {
    await ctx.runQuery(internal.agcAdminData.requireAdminSession, {
      sessionToken: args.sessionToken,
    });

    const rows: Array<{
      referenceNumber: string | undefined;
      region: string;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
      currency: string;
      paymentMode: string;
      paymentStatus: string;
      offlineRef: string;
      method: string;
      paymentDate: string;
      createdAt: number;
    }> = await ctx.runQuery(internal.agcAdminData.listRegistrationExportData, {});

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Registrations");
    sheet.columns = [
      { header: "Reference", key: "reference", width: 14 },
      { header: "Region", key: "region", width: 18 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Unit Price", key: "unit", width: 12 },
      { header: "Total", key: "total", width: 12 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Mode", key: "mode", width: 12 },
      { header: "Payment Status", key: "status", width: 20 },
      { header: "Offline Ref", key: "offlineRef", width: 20 },
      { header: "Method", key: "method", width: 16 },
      { header: "Payment Date", key: "paymentDate", width: 14 },
      { header: "Created At", key: "createdAt", width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow({
        reference: row.referenceNumber ?? "",
        region: row.region,
        quantity: row.quantity,
        unit: row.unitPrice,
        total: row.totalAmount,
        currency: row.currency,
        mode: row.paymentMode,
        status: row.paymentStatus,
        offlineRef: row.offlineRef,
        method: row.method,
        paymentDate: row.paymentDate,
        createdAt: new Date(row.createdAt).toISOString(),
      });
    }
    sheet.autoFilter = { from: "A1", to: "L1" };

    const buffer = await workbook.xlsx.writeBuffer();
    return {
      filename: `homecoming-2026-registrations-${new Date().toISOString().slice(0, 10)}.xlsx`,
      contentBase64: Buffer.from(buffer as ArrayBuffer).toString("base64"),
    };
  },
});


