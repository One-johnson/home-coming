"use node";

import ExcelJS from "exceljs";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { AgcAccommodationType } from "./schemaTypes";

/**
 * Physical room inventory import (Phase 2 §3). The workbook arrives from the
 * client as base64; this action parses it into typed rows, checks them with
 * the same role gate, and hands them to the mutation in agcRoomAssignments
 * for validation (pool caps, occupancy) and commit.
 */

const HEADER_LOCATION = "Accommodation location";
const HEADER_BUILDING = "Building / block";
const HEADER_ROOM = "Room number or apartment name";
const HEADER_CAPACITY = "Room capacity (beds/delegates)";
const HEADER_GENDER = "Gender designation (blank = any)";

function normalizeType(raw: string): AgcAccommodationType | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (!value) return null;
  if (value.includes("dorm") || value.includes("fortress")) return "dormitory";
  if (value.includes("hostel")) return "hostel";
  if (value.includes("serpent")) return "wise_serpents";
  if (value.includes("general")) return "good_general";
  if (value.includes("ebpv") || value.includes("village")) return "ebpv";
  if (["dormitory", "hostel", "wise_serpents", "good_general", "ebpv"].includes(value)) {
    return value as AgcAccommodationType;
  }
  return null;
}

function cellText(row: ExcelJS.Row, column: number): string {
  const cell = row.getCell(column);
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text).trim();
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "").trim();
  return String(value).trim();
}

function normalizeGender(raw: string): "male" | "female" | undefined {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("m") && value !== "") return "male";
  if (value.startsWith("f")) return "female";
  return undefined;
}

export const parseRoomImportWorkbook = action({
  args: { sessionToken: v.string(), contentBase64: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    rows: {
      accommodationType: AgcAccommodationType;
      building?: string;
      name: string;
      gender?: "male" | "female";
      capacity: number;
    }[];
    invalidRows: { row: number; reason: string }[];
  }> => {
    await ctx.runQuery(internal.agcRoomAssignments.requireRoomAccess, {
      sessionToken: args.sessionToken,
    });

    const buffer = Buffer.from(args.contentBase64, "base64");
    let workbook: ExcelJS.Workbook;
    try {
      workbook = new ExcelJS.Workbook();
      // exceljs's own Buffer type differs from the convex-runtime @types/node
      // Buffer — the data is identical, only the declaration differs.
      await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);
    } catch {
      throw new ConvexError("Could not read the workbook — is it a valid .xlsx file?");
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ConvexError("The workbook has no sheets");

    // Map columns by header text so column order doesn't matter.
    const headerRow = sheet.getRow(1);
    const map: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const text = cellText(headerRow, colNumber).toLowerCase();
      if (text.includes("accommodation") || text.includes("location")) map.location ||= colNumber;
      if (text.includes("building") || text.includes("block")) map.building ||= colNumber;
      if (text.includes("room") || text.includes("apartment")) map.room ||= colNumber;
      if (text.includes("capacity")) map.capacity ||= colNumber;
      if (text.includes("gender")) map.gender ||= colNumber;
    });
    if (!map.location || !map.room || !map.capacity) {
      throw new ConvexError(
        "Missing columns — the sheet needs Accommodation location, Room number or apartment name, and Room capacity",
      );
    }

    const rows: {
      accommodationType: AgcAccommodationType;
      building?: string;
      name: string;
      gender?: "male" | "female";
      capacity: number;
    }[] = [];
    const invalidRows: { row: number; reason: string }[] = [];
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const locationRaw = cellText(row, map.location);
      const nameRaw = cellText(row, map.room);
      const capacityRaw = cellText(row, map.capacity);
      if (!locationRaw && !nameRaw) continue; // blank filler row
      const type = normalizeType(locationRaw);
      const capacity = Number(capacityRaw);
      if (!type) {
        invalidRows.push({ row: r, reason: `Unknown accommodation location "${locationRaw}"` });
        continue;
      }
      if (!nameRaw) {
        invalidRows.push({ row: r, reason: "Missing room / apartment name" });
        continue;
      }
      if (!Number.isInteger(capacity) || capacity <= 0) {
        invalidRows.push({ row: r, reason: `Capacity "${capacityRaw}" is not a positive whole number` });
        continue;
      }
      rows.push({
        accommodationType: type,
        building: cellText(row, map.building) || undefined,
        name: nameRaw,
        gender: map.gender ? normalizeGender(cellText(row, map.gender)) : undefined,
        capacity,
      });
    }
    return { rows, invalidRows };
  },
});

/** Downloadable template pre-filled with the §3 accommodation layout hints. */
export const generateRoomImportTemplate = action({
  args: { sessionToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ filename: string; contentBase64: string }> => {
    await ctx.runQuery(internal.agcRoomAssignments.requireRoomAccess, {
      sessionToken: args.sessionToken,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Room inventory");
    sheet.columns = [
      { header: HEADER_LOCATION, key: "location", width: 30 },
      { header: HEADER_BUILDING, key: "building", width: 22 },
      { header: HEADER_ROOM, key: "room", width: 28 },
      { header: HEADER_CAPACITY, key: "capacity", width: 14 },
      { header: HEADER_GENDER, key: "gender", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };

    const examples: Array<[string, string, string, number, string]> = [
      ["Mighty Fortress Dormitories", "", "Dorm hall", 2500, ""],
      ["Hostels Blocks 1–4", "Block 1", "Room 101", 8, ""],
      ["Hostels Blocks 7–8", "Block 8", "Room 701", 8, ""],
      ["Wise as Serpents Lodge", "", "Room 1", 1, ""],
      ["Good General Lodge", "", "Room 12", 1, ""],
      ["Everything by Prayer Village", "", "Apartment 1", 4, ""],
    ];
    for (const [location, building, room, capacity, gender] of examples) {
      sheet.addRow({ location, building, room, capacity, gender });
    }
    sheet.addRow([]);
    sheet.addRow({
      location: "Tips: delete these sample rows first.",
      capacity: "",
    });
    sheet.addRow({
      location:
        "Unnumbered beds = one row with the bed total. EBPV = one row per apartment (capacity 4).",
    });
    sheet.addRow({
      location:
        "Gender: optional, applies to dormitory/hostel rooms only; lodges and EBPV are mixed.",
    });

    const out = await workbook.xlsx.writeBuffer();
    return {
      filename: "agc-2026-room-inventory-template.xlsx",
      contentBase64: Buffer.from(out as ArrayBuffer).toString("base64"),
    };
  },
});
