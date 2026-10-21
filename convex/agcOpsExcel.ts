"use node";

import ExcelJS from "exceljs";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Operational report exports (Phase 2 §24). All reports run through one
 * action + one loader so every report supports the same filter set:
 * accommodation type, building, hub, gender, room.
 */

type ReportKind =
  | "room_assignments"
  | "unassigned_delegates"
  | "occupancy"
  | "checked_in"
  | "not_arrived"
  | "check_out"
  | "key_issuance"
  | "key_replacement"
  | "room_changes"
  | "payment_overrides"
  | "offline_sync"
  | "check_in_activity";

const REPORT_META: Record<ReportKind, { title: string; fileStem: string }> = {
  room_assignments: { title: "Room Assignment Report", fileStem: "room-assignments" },
  unassigned_delegates: { title: "Unassigned Delegates Report", fileStem: "unassigned-delegates" },
  occupancy: { title: "Accommodation Occupancy Report", fileStem: "occupancy" },
  checked_in: { title: "Checked-In Delegates Report", fileStem: "checked-in-delegates" },
  not_arrived: { title: "Not-Arrived Delegates Report", fileStem: "not-arrived-delegates" },
  check_out: { title: "Check-Out Report", fileStem: "check-outs" },
  key_issuance: { title: "Key Issuance Report", fileStem: "key-issuance" },
  key_replacement: { title: "Key Replacement Report", fileStem: "key-replacement" },
  room_changes: { title: "Room Change History", fileStem: "room-changes" },
  payment_overrides: { title: "Payment Override Report", fileStem: "payment-overrides" },
  offline_sync: { title: "Offline Synchronization Exceptions", fileStem: "offline-sync-exceptions" },
  check_in_activity: { title: "Check-In Activity Report", fileStem: "check-in-activity" },
};

/** Column keys → headers; the loader returns objects keyed by column key. */
const SHEET_COLUMNS: Record<ReportKind, { key: string; header: string; width: number }[]> = {
  room_assignments: [
    { key: "type", header: "Location", width: 24 },
    { key: "building", header: "Building/Block", width: 18 },
    { key: "room", header: "Room", width: 22 },
    { key: "capacity", header: "Capacity", width: 10 },
    { key: "guest", header: "Delegate", width: 28 },
    { key: "gender", header: "Gender", width: 10 },
    { key: "hub", header: "Hub", width: 26 },
    { key: "bookingRef", header: "Booking ref", width: 16 },
    { key: "assignedAt", header: "Assigned at", width: 20 },
    { key: "assignedBy", header: "Assigned by", width: 24 },
  ],
  unassigned_delegates: [
    { key: "guest", header: "Delegate", width: 28 },
    { key: "gender", header: "Gender", width: 10 },
    { key: "type", header: "Location", width: 24 },
    { key: "hub", header: "Hub", width: 26 },
    { key: "bookingRef", header: "Booking ref", width: 16 },
    { key: "paymentStatus", header: "Payment status", width: 18 },
  ],
  occupancy: [
    { key: "type", header: "Location", width: 24 },
    { key: "building", header: "Building/Block", width: 18 },
    { key: "room", header: "Room", width: 22 },
    { key: "capacity", header: "Capacity", width: 10 },
    { key: "assigned", header: "Assigned", width: 10 },
    { key: "checkedIn", header: "Checked in", width: 12 },
    { key: "available", header: "Available", width: 10 },
    { key: "occupancyPercent", header: "Occupancy", width: 12 },
  ],
  checked_in: [
    { key: "guest", header: "Delegate", width: 28 },
    { key: "gender", header: "Gender", width: 10 },
    { key: "hub", header: "Hub", width: 26 },
    { key: "type", header: "Location", width: 24 },
    { key: "building", header: "Building/Block", width: 18 },
    { key: "room", header: "Room", width: 22 },
    { key: "bookingRef", header: "Booking ref", width: 16 },
    { key: "checkedIn", header: "Checked in at", width: 20 },
    { key: "by", header: "By", width: 24 },
  ],
  not_arrived: [
    { key: "guest", header: "Delegate", width: 28 },
    { key: "gender", header: "Gender", width: 10 },
    { key: "hub", header: "Hub", width: 26 },
    { key: "type", header: "Location", width: 24 },
    { key: "building", header: "Building/Block", width: 18 },
    { key: "room", header: "Room", width: 22 },
    { key: "bookingRef", header: "Booking ref", width: 16 },
  ],
  check_out: [
    { key: "guest", header: "Delegate", width: 28 },
    { key: "hub", header: "Hub", width: 26 },
    { key: "building", header: "Building/Block", width: 18 },
    { key: "room", header: "Room", width: 22 },
    { key: "checkedIn", header: "Checked in", width: 20 },
    { key: "checkedOut", header: "Checked out", width: 20 },
    { key: "by", header: "By", width: 24 },
    { key: "keyReturn", header: "Key return", width: 14 },
  ],
  key_issuance: [
    { key: "type", header: "Location", width: 24 },
    { key: "building", header: "Building/Block", width: 18 },
    { key: "room", header: "Room/Apartment", width: 22 },
    { key: "recipient", header: "Recipient", width: 28 },
    { key: "status", header: "Status", width: 12 },
    { key: "issued", header: "Issued at", width: 20 },
    { key: "by", header: "By", width: 24 },
  ],
  key_replacement: [
    { key: "type", header: "Location", width: 24 },
    { key: "room", header: "Room/Apartment", width: 22 },
    { key: "recipient", header: "Recipient", width: 28 },
    { key: "status", header: "Status", width: 12 },
    { key: "replaced", header: "Replaced at", width: 20 },
    { key: "by", header: "By", width: 24 },
  ],
  room_changes: [
    { key: "guest", header: "Delegate", width: 28 },
    { key: "fromBuilding", header: "From building", width: 18 },
    { key: "fromRoom", header: "From room", width: 22 },
    { key: "movedTo", header: "Moved to", width: 22 },
    { key: "ended", header: "At", width: 20 },
    { key: "reason", header: "Reason", width: 40 },
    { key: "by", header: "By", width: 24 },
  ],
  payment_overrides: [
    { key: "guest", header: "Delegate", width: 28 },
    { key: "hub", header: "Hub", width: 26 },
    { key: "room", header: "Room", width: 22 },
    { key: "checkedIn", header: "Checked in", width: 20 },
    { key: "overrideBy", header: "Authorized by", width: 24 },
    { key: "overrideAt", header: "Authorized at", width: 20 },
    { key: "reason", header: "Reason", width: 40 },
    { key: "corrected", header: "Correction", width: 20 },
  ],
  offline_sync: [
    { key: "txId", header: "Transaction ID", width: 40 },
    { key: "staffId", header: "Staff", width: 24 },
    { key: "building", header: "Building", width: 18 },
    { key: "action", header: "Action", width: 14 },
    { key: "originalAt", header: "Original time", width: 20 },
    { key: "status", header: "Status", width: 12 },
    { key: "reason", header: "Reason", width: 40 },
  ],
  check_in_activity: [
    { key: "guest", header: "Delegate", width: 28 },
    { key: "hub", header: "Hub", width: 26 },
    { key: "building", header: "Building/Block", width: 18 },
    { key: "room", header: "Room", width: 22 },
    { key: "location", header: "Desk location", width: 16 },
    { key: "checkedIn", header: "Checked in", width: 20 },
    { key: "by", header: "By", width: 26 },
    { key: "checkedOut", header: "Checked out", width: 20 },
    { key: "correction", header: "Correction", width: 26 },
  ],
};

export const exportOpsReportExcel = action({
  args: {
    sessionToken: v.string(),
    report: v.string(),
    accommodationType: v.optional(v.string()),
    building: v.optional(v.string()),
    hubId: v.optional(v.id("agcHubs")),
    gender: v.optional(v.string()),
    roomId: v.optional(v.id("agcRooms")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ filename: string; contentBase64: string }> => {
    await ctx.runQuery(internal.agcOpsData.requireReportAccess, {
      sessionToken: args.sessionToken,
    });

    const kind = args.report as ReportKind;
    const meta = REPORT_META[kind];
    if (!meta) throw new ConvexError(`Unknown report: ${args.report}`);
    const columns = SHEET_COLUMNS[kind];

    const rows = (await ctx.runQuery(internal.agcOpsData.getReportRows, {
      report: kind,
      accommodationType: args.accommodationType,
      building: args.building,
      hubId: args.hubId,
      gender: args.gender,
      roomId: args.roomId,
    })) as Record<string, unknown>[];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Report", {
      properties: { tabColor: { argb: "FF1F6E43" } },
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 },
        horizontalCentered: true,
      },
    });

    sheet.columns = columns.map((col) => ({ key: col.key, header: col.header, width: col.width }));
    const titleRow = sheet.insertRow(1, [meta.title, "", "", "", `Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)}`]);
    titleRow.font = { bold: true, size: 14 };
    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 2, activeCell: "A3" }];

    for (const row of rows) {
      sheet.addRow(
        columns.map((col) =>
          row[col.key] === undefined || row[col.key] === null ? "" : String(row[col.key]),
        ),
      );
    }

    const out = await workbook.xlsx.writeBuffer();
    const parts = args.accommodationType || args.building ? "+" : "";
    return {
      filename: `agc-2026-${meta.fileStem}${parts}.xlsx`,
      contentBase64: Buffer.from(out as ArrayBuffer).toString("base64"),
    };
  },
});
