/**
 * Regenerates the real .xlsx fixture used by the physical inventory import
 * integration test (tests/fixtures/agc-room-inventory-integration.xlsx).
 * Run: node scripts/make-room-fixture.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(root, "tests", "fixtures", "agc-room-inventory-integration.xlsx");
mkdirSync(dirname(outPath), { recursive: true });

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Room inventory");
sheet.columns = [
  { header: "Accommodation location", key: "location", width: 30 },
  { header: "Building / block", key: "building", width: 20 },
  { header: "Room number or apartment name", key: "room", width: 28 },
  { header: "Room capacity (beds/delegates)", key: "capacity", width: 14 },
  { header: "Gender designation (blank = any)", key: "gender", width: 20 },
];
sheet.getRow(1).font = { bold: true };

// Row 2–6: valid rows across every accommodation type.
// Row 7: an EBPV apartment that passes workbook parsing (positive integer)
//        but must be rejected by the import commit (cap 4 + mixed-gender).
// Row 8: an unknown accommodation location — reported as an invalid row.
const rows = [
  ["Mighty Fortress Dormitories", "", "Dorm Hall 1", 2, "Male"],
  ["Hostels Blocks 1–4", "Block 1", "Room 101", 1, "Female"],
  ["Wise as Serpents Lodge", "", "WSL Room 1", 1, ""],
  ["Good General Lodge", "", "GGL Room 1", 1, ""],
  ["Everything by Prayer Village", "", "Apartment 1", 4, ""],
  ["Everything by Prayer Village", "", "Apartment 2", 5, "Female"],
  ["Not A Real Location", "", "Room X", 1, ""],
];
for (const [location, building, room, capacity, gender] of rows) {
  sheet.addRow({ location, building, room, capacity, gender });
}

await workbook.xlsx.writeFile(outPath);
console.log(`Wrote ${rows.length} data rows to ${outPath}`);
