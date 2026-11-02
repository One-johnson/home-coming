"use node";

import ExcelJS from "exceljs";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * One workbook for the receipts archive: every paid receipt, every POA receipt
 * or both, each row linking straight to the file in storage. Amounts stay in
 * their own currency — totals are grouped per currency, never summed across
 * cedis and dollars.
 */

const COLUMNS = [
  { key: "kind", header: "Receipt", width: 14 },
  { key: "record", header: "Record", width: 16 },
  { key: "reference", header: "Reference", width: 18 },
  { key: "hub", header: "Hub", width: 28 },
  { key: "rep", header: "Rep", width: 22 },
  { key: "amount", header: "Amount", width: 14 },
  { key: "currency", header: "Currency", width: 10 },
  { key: "confirmed", header: "Payment confirmed", width: 18 },
  { key: "poaStatus", header: "POA status", width: 20 },
  { key: "file", header: "Receipt file", width: 42 },
  { key: "type", header: "File type", width: 22 },
] as const;

const AMOUNT_COLUMN = 6;
const FILE_COLUMN = 10;

function formatDay(at: number | null): string {
  if (!at) return "";
  return new Date(at).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type ExportRow = {
  record: "registration" | "booking";
  receiptKind: "paid" | "poa";
  reference: string;
  hubName: string;
  repUsername: string;
  amount: number;
  currency: string;
  confirmedAt: number | null;
  poaStatus: "evidence_submitted" | "confirmed" | null;
  fileName: string | null;
  contentType: string | null;
  storageId: Id<"_storage">;
};

/** Add one sheet: titled header, receipts, then a total per currency. */
function addReceiptSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  rows: ExportRow[],
  links: Map<Id<"_storage">, string | null>,
) {
  const sheet = workbook.addWorksheet(title, {
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

  sheet.columns = COLUMNS.map((column) => ({ ...column }));
  const titleRow = sheet.insertRow(1, [
    `AGC 2026 — ${title}`,
    "",
    "",
    "",
    `Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
  ]);
  titleRow.font = { bold: true, size: 14 };
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];
  const headerRow = sheet.getRow(2);
  headerRow.font = { bold: true };

  for (const row of rows) {
    const added = sheet.addRow([
      row.receiptKind === "paid" ? "Paid" : "POA",
      row.record === "registration" ? "Registration" : "Accommodation",
      row.reference,
      row.hubName,
      row.repUsername,
      row.amount,
      row.currency,
      formatDay(row.confirmedAt),
      row.poaStatus === "confirmed"
        ? "Confirmed"
        : row.poaStatus === "evidence_submitted"
          ? "Awaiting confirmation"
          : "",
      row.fileName ?? "",
      row.contentType ?? "",
    ]);
    added.getCell(AMOUNT_COLUMN).numFmt = "#,##0.00";

    const url = links.get(row.storageId);
    if (url) {
      const cell = added.getCell(FILE_COLUMN);
      cell.value = { text: row.fileName ?? "Open receipt", hyperlink: url };
      cell.font = { color: { argb: "FF1F6E43" }, underline: true };
    }
  }

  const byCurrency = new Map<string, number>();
  for (const row of rows) {
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.amount);
  }
  for (const [currency, amount] of [...byCurrency.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const totalRow = sheet.addRow([
      "",
      "",
      "",
      "",
      `TOTAL ${currency}`,
      amount,
      currency,
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(AMOUNT_COLUMN).numFmt = "#,##0.00";
  }

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2 + rows.length, column: COLUMNS.length },
    };
  }

  return sheet;
}

export const exportReceiptsExcel = action({
  args: { sessionToken: v.string(), filter: v.string() },
  handler: async (ctx, args): Promise<{ filename: string; contentBase64: string; rows: number }> => {
    const filter =
      args.filter === "paid" || args.filter === "poa" ? args.filter : "all";

    const result = await ctx.runQuery(
      internal.agcReceipts.getReceiptRowsForExport,
      { sessionToken: args.sessionToken, filter },
    );
    const rows = result.rows as ExportRow[];

    // Storage URLs stay valid while the blob exists, so the workbook keeps
    // working as an audit trail without embedding hundreds of megabytes.
    const links = new Map<Id<"_storage">, string | null>();
    for (const row of rows) {
      if (links.has(row.storageId)) continue;
      links.set(
        row.storageId,
        await ctx.storage.getUrl(row.storageId as never),
      );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AGC 2026 admin console";
    workbook.created = new Date();

    const paid = rows.filter((row) => row.receiptKind === "paid");
    const poa = rows.filter((row) => row.receiptKind === "poa");
    if (filter !== "poa") addReceiptSheet(workbook, "Paid receipts", paid, links);
    if (filter !== "paid") addReceiptSheet(workbook, "POA receipts", poa, links);

    if (workbook.worksheets.length === 0) {
      addReceiptSheet(workbook, "Paid receipts", [], links);
    }

    const out = await workbook.xlsx.writeBuffer();
    return {
      filename: `agc-2026-receipts-${filter}-${today()}.xlsx`,
      contentBase64: Buffer.from(out as ArrayBuffer).toString("base64"),
      rows: rows.length,
    };
  },
});