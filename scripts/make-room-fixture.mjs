/**
 * Regenerates the real .xlsx fixture used by the physical inventory import
 * integration test (tests/fixtures/agc-room-inventory-integration.xlsx).
 * Run: node scripts/make-room-fixture.mjs
 *
 * The fixture mirrors the accommodation team's own workbook: one sheet per
 * accommodation type, a title row, then a NO. OF ROOMS / ROOM NUMBER /
 * CAPACITY header row with one room per row underneath. No location column and
 * no gender column.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(root, "tests", "fixtures", "agc-room-inventory-integration.xlsx");
mkdirSync(dirname(outPath), { recursive: true });

const workbook = new ExcelJS.Workbook();

function addRoomSheet({ name, titleRows, header, rows }) {
  const sheet = workbook.addWorksheet(name);
  titleRows.forEach((title, index) => {
    const row = sheet.getRow(index + 1);
    for (let c = 1; c <= header.length; c += 1) row.getCell(c).value = title;
  });
  const headerRow = sheet.getRow(titleRows.length + 1);
  header.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  rows.forEach((values) => {
    sheet.addRow(values);
  });
}

// 200 real rooms capped at 4 in the source workbook; the fixture keeps three,
// one of which has no capacity so it is reported as an invalid row.
addRoomSheet({
  name: "Hostels without heater",
  titleRows: ["HOSTEL WITHOUT HEATER"],
  header: ["NO. OF ROOMS", "ROOM NUMBER", "CAPACITY"],
  rows: [
    [1, "101", 4],
    [2, "102", 4],
    [3, "103", ""],
  ],
});

// Three title rows, plus an extra information column between the room and the
// capacity — the WASL sheet in the real workbook looks like this.
addRoomSheet({
  name: "WASL",
  titleRows: ["WISE AS SERPENTS", "WISE AS SERPENTS", "WISE AS SERPENTS"],
  header: ["NO. OF ROOMS", "ROOM NUMBER", "ADDITONAL INFORMATION", "CAPACITY"],
  rows: [
    [1, "1", "", 2],
    [2, "2", "HAS FRIDGE", 2],
  ],
});

addRoomSheet({
  name: "GGL",
  titleRows: ["GOOD GENERAL", "GOOD GENERAL"],
  header: ["NO. OF ROOMS", "ROOM NUMBER", "Capacity"],
  rows: [[1, "Room 101", 2]],
});

// Apartment 2 parses fine but breaks the EBPV rule (max 4 delegates), so the
// commit must reject it.
addRoomSheet({
  name: "EBPV",
  titleRows: ["EVERYTHING BY PRAYER VILLAGE", "EVERYTHING BY PRAYER VILLAGE"],
  header: ["No", "Apartment name", "CAPACITY"],
  rows: [
    [1, "Apartment 1", 4],
    [2, "Apartment 2", 5],
  ],
});

// Cover sheets carry no inventory and must be ignored by the parser.
const instructions = workbook.addWorksheet("Instructions");
instructions.getCell(1, 1).value =
  "One sheet per accommodation type. Keep the title and header rows, then add one room per row. NO. OF ROOMS is only a count and is ignored.";

await workbook.xlsx.writeFile(outPath);
console.log(`Wrote room inventory fixture to ${outPath}`);
