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
 *
 * The accepted layout is the accommodation team's own sheet: one worksheet per
 * accommodation type, a title row, then a header row ("NO. OF ROOMS" /
 * "ROOM NUMBER" / "CAPACITY", or "Apartment name" for EBPV) with one room per
 * row below it. The sheet name or its title says which type it is, so there is
 * no location column; there is no gender column either — staff assign and check
 * in delegates manually, so rooms import ungendered.
 */

/** Header cells are short labels; long instruction sentences never match. */
function isHeaderLabel(text: string): boolean {
  if (!text || text.length > 40) return false;
  return text.split(/\s+/).filter(Boolean).length <= 5;
}

function isRoomHeader(text: string): boolean {
  // "NO. OF ROOMS" is a sequence counter, not the room name column.
  if (/^(no\b\.?|number)\s*(of\s*)?(rooms?)\b/.test(text)) return false;
  if (/room\s*(number|no\b|name)|\bapartment\b/.test(text)) return true;
  return /\brooms?\b/.test(text) && !/\b(no|number)\b/.test(text);
}

function isCapacityHeader(text: string): boolean {
  if (/^(no\b\.?|number)\s*(of\s*)?(rooms?)\b/.test(text)) return false;
  return (
    /\bcapacity\b/.test(text) ||
    /\b(beds?|spaces?|delegates?|occupancy|persons?)\b/.test(text)
  );
}

function normalizeType(raw: string): AgcAccommodationType | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!value) return null;
  if (/dorm|fortress/.test(value)) return "dormitory";
  if (/hostel/.test(value)) return "hostel";
  if (/serpent|\bwasl\b|\bwsl\b/.test(value)) return "wise_serpents";
  if (/general|\bggl\b/.test(value)) return "good_general";
  if (/ebpv|village/.test(value)) return "ebpv";
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
  if (typeof value === "object" && "richText" in value) {
    const runs = (value as { richText: { text: string }[] }).richText;
    return runs.map((run) => run.text).join("").trim();
  }
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "").trim();
  return String(value).trim();
}

type SheetHeader = {
  rowNumber: number;
  roomColumn: number;
  capacityColumn: number;
  locationColumn?: number;
  buildingColumn?: number;
};

/** Find the header row anywhere near the top; titles/metadata rows come first. */
function findHeaderRow(sheet: ExcelJS.Worksheet): SheetHeader | null {
  const lastRow = Math.min(sheet.rowCount, 15);
  for (let r = 1; r <= lastRow; r += 1) {
    const row = sheet.getRow(r);
    let roomColumn = 0;
    let capacityColumn = 0;
    let locationColumn = 0;
    let buildingColumn = 0;
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const text = cellText(row, c).toLowerCase();
      if (!text || !isHeaderLabel(text)) continue;
      if (!roomColumn && isRoomHeader(text)) roomColumn = c;
      if (!capacityColumn && isCapacityHeader(text)) capacityColumn = c;
      if (!locationColumn && (text.includes("accommodation") || text.includes("location"))) {
        locationColumn = c;
      }
      if (!buildingColumn && (text.includes("building") || text.includes("block"))) {
        buildingColumn = c;
      }
    }
    if (roomColumn && capacityColumn) {
      return {
        rowNumber: r,
        roomColumn,
        capacityColumn,
        locationColumn: locationColumn || undefined,
        buildingColumn: buildingColumn || undefined,
      };
    }
  }
  return null;
}

/** Sheet name plus any title rows above the header decide the accommodation type. */
function sheetTypeText(sheet: ExcelJS.Worksheet, headerRowNumber: number): string {
  const parts: string[] = [sheet.name];
  for (let r = 1; r < headerRowNumber; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= Math.min(sheet.columnCount, 6); c += 1) {
      const text = cellText(row, c);
      if (text) parts.push(text);
    }
  }
  return parts.join(" ");
}

type ParsedRoomRow = {
  accommodationType: AgcAccommodationType;
  building?: string;
  name: string;
  capacity: number;
};

export const parseRoomImportWorkbook = action({
  args: { sessionToken: v.string(), contentBase64: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    rows: ParsedRoomRow[];
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
    if (workbook.worksheets.length === 0) throw new ConvexError("The workbook has no sheets");

    const rows: ParsedRoomRow[] = [];
    const invalidRows: { row: number; reason: string }[] = [];
    let recognisedSheets = 0;

    for (const sheet of workbook.worksheets) {
      // Instruction / cover sheets carry no inventory.
      if (/^(instructions?|read ?me|notes?|guide|cover)\b/i.test(sheet.name.trim())) continue;
      const header = findHeaderRow(sheet);
      if (!header) continue;
      recognisedSheets += 1;

      const sheetType = normalizeType(sheetTypeText(sheet, header.rowNumber));
      if (!sheetType && !header.locationColumn) {
        invalidRows.push({
          row: header.rowNumber,
          reason: `${sheet.name}: could not tell the accommodation type — name the sheet Hostels, WASL, GGL, EBPV or Dormitories, or add the type as a title row.`,
        });
        continue;
      }

      for (let r = header.rowNumber + 1; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        const nameRaw = cellText(row, header.roomColumn);
        const capacityRaw = cellText(row, header.capacityColumn);
        const locationRaw = header.locationColumn ? cellText(row, header.locationColumn) : "";
        if (!nameRaw && !capacityRaw && !locationRaw) continue; // blank filler row

        // A per-row location column (older sheets) overrides the sheet's type.
        const type = locationRaw ? normalizeType(locationRaw) : sheetType;
        if (!type) {
          invalidRows.push({
            row: r,
            reason: `${sheet.name}: unknown accommodation location "${locationRaw}"`,
          });
          continue;
        }
        if (!nameRaw) {
          invalidRows.push({ row: r, reason: `${sheet.name}: missing room / apartment name` });
          continue;
        }
        const capacity = Number(capacityRaw.replace(/,/g, ""));
        if (!Number.isInteger(capacity) || capacity <= 0) {
          invalidRows.push({
            row: r,
            reason: `${sheet.name}: capacity "${capacityRaw}" for ${nameRaw} is not a positive whole number`,
          });
          continue;
        }
        rows.push({
          accommodationType: type,
          building: header.buildingColumn
            ? cellText(row, header.buildingColumn) || undefined
            : undefined,
          name: nameRaw,
          capacity,
        });
      }
    }

    if (recognisedSheets === 0) {
      throw new ConvexError(
        "No room sheet found — each sheet needs a NO. OF ROOMS / ROOM NUMBER / CAPACITY header row with one room per row below it",
      );
    }
    if (rows.length === 0 && invalidRows.length === 0) {
      throw new ConvexError("No room rows found under the headers");
    }
    return { rows, invalidRows };
  },
});

type TemplateSheet = {
  name: string;
  title: string;
  columns: string[];
};

/**
 * Downloadable template in the accommodation team's own layout: one sheet per
 * type, a title row, then the header row staff fill underneath.
 */
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
    const sheets: TemplateSheet[] = [
      { name: "Dormitories", title: "MIGHTY FORTRESS DORMITORIES", columns: ["NO. OF ROOMS", "ROOM / DORM NAME", "CAPACITY"] },
      { name: "Hostels without heater", title: "HOSTEL WITHOUT HEATER", columns: ["NO. OF ROOMS", "ROOM NUMBER", "CAPACITY"] },
      { name: "Hostels with heater", title: "HOSTEL WITH HEATER", columns: ["NO. OF ROOMS", "ROOM NUMBER", "CAPACITY"] },
      { name: "WASL", title: "WISE AS SERPENTS", columns: ["NO. OF ROOMS", "ROOM NUMBER", "ADDITONAL INFORMATION", "CAPACITY"] },
      { name: "GGL", title: "GOOD GENERAL", columns: ["NO. OF ROOMS", "ROOM NUMBER", "CAPACITY"] },
      { name: "EBPV", title: "EVERYTHING BY PRAYER VILLAGE", columns: ["No", "Apartment name", "CAPACITY"] },
    ];

    for (const definition of sheets) {
      const sheet = workbook.addWorksheet(definition.name);
      sheet.columns = definition.columns.map((header, index) => ({
        header: "",
        key: `c${index}`,
        width: index === 1 ? 32 : 18,
      }));
      sheet.mergeCells(1, 1, 1, definition.columns.length);
      const titleCell = sheet.getCell(1, 1);
      titleCell.value = definition.title;
      titleCell.font = { bold: true, size: 12 };
      titleCell.alignment = { horizontal: "center" };
      const headerRow = sheet.getRow(2);
      definition.columns.forEach((label, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = label;
        cell.font = { bold: true };
      });
      headerRow.commit();
    }

    const instructions = workbook.addWorksheet("Instructions");
    instructions.getColumn(1).width = 110;
    [
      "One sheet per accommodation type. Keep the title row and the header row; add one room per row underneath.",
      "NO. OF ROOMS is only a sequence number and is ignored — the room name comes from the ROOM NUMBER / Apartment name column.",
      "The type comes from the sheet name or title: Hostels (with/without heater) → hostel, WASL / Wise as Serpents, GGL / Good General, EBPV / Everything by Prayer Village, Dormitories / Mighty Fortress.",
      "Leave a sheet empty (headers only) if you have no rooms of that type.",
      "Dormitory halls without numbered rooms: one row with the hall name and the total bed count.",
      "EBPV: one row per apartment with its delegate capacity, maximum 4.",
      "No gender column is needed — staff assign delegates and check them in manually at the desk.",
      "Imports never exceed the confirmed inventory pools, and same-named rooms are updated in place.",
    ].forEach((line, index) => {
      const cell = instructions.getCell(index + 1, 1);
      cell.value = line;
      cell.alignment = { wrapText: true };
    });

    const out = await workbook.xlsx.writeBuffer();
    return {
      filename: "agc-2026-room-inventory-template.xlsx",
      contentBase64: Buffer.from(out as ArrayBuffer).toString("base64"),
    };
  },
});
