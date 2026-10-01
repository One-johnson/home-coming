import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { api } from "../convex/_generated/api";
import { createTestConvex } from "./testUtils";

/**
 * exportHubsRepsExcel — combined hubs + representatives workbook including
 * the temporary password column for accounts still pending setup.
 *
 * Seeding mirrors tests/agcAuth.test.ts: an admin user + session satisfies
 * requireAdminViaAction, and rep rows are inserted directly.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

async function seedAdminSession(t: TestConvex): Promise<string> {
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

async function seedHub(
  t: TestConvex,
  name: string,
  region: "ghana" | "england",
) {
  return t.run((ctx) =>
    ctx.db.insert("agcHubs", {
      name,
      region,
      country: region === "ghana" ? "Ghana" : "United Kingdom",
      active: true,
      createdAt: Date.now(),
    }),
  );
}

test("export workbook has one row per hub with derived usernames, real statuses, and pending-setup passwords", async () => {
  const t = createTestConvex();
  const token = await seedAdminSession(t);

  const pendingHubId = await seedHub(t, "Ashanti Mampong", "ghana");
  const activeHubId = await seedHub(t, "London Central", "england");
  // A hub with no rep account must still appear, with its derived username.
  await seedHub(t, "Kumasi Central", "ghana");

  const { default: bcrypt } = await import("bcryptjs");
  const tempPassword = "temp-pass-123";
  await t.run((ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId: pendingHubId,
      username: "ashanti_mampong",
      email: "pending@hub.example",
      passwordHash: bcrypt.hashSync(tempPassword, 4),
      tempPassword,
      profileComplete: false,
      mustChangePassword: true,
      status: "pending_setup",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );
  await t.run((ctx) =>
    ctx.db.insert("agcRepresentatives", {
      hubId: activeHubId,
      username: "london_central",
      passwordHash: bcrypt.hashSync("private-active-pass-1", 4),
      profileComplete: true,
      mustChangePassword: false,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as never),
  );

  const result = await t.action(api.agcExcel.exportHubsRepsExcel, {
    sessionToken: token,
  });
  expect(result.filename).toMatch(/^homecoming-2026-hubs-reps-\d{4}-\d{2}-\d{2}\.xlsx$/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(result.contentBase64, "base64") as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0],
  );

  // Single sheet with one row per hub — including hub-less reps —
  // preceded by a bold summary line carrying the per-status totals.
  const sheet = workbook.getWorksheet("Hubs & Reps");
  expect(sheet).toBeDefined();
  const rows: Array<Record<string, string>> = [];
  let summaryRow: Record<string, string> | null = null;
  sheet!.eachRow((row, rowNumber) => {
    const values = row.values as unknown[];
    const read = () => ({
      username: String(values[1] ?? ""),
      hub: String(values[2] ?? ""),
      region: String(values[3] ?? ""),
      country: String(values[4] ?? ""),
      password: String(values[5] ?? ""),
      status: String(values[6] ?? ""),
    });
    if (rowNumber === 2) {
      summaryRow = read();
      return;
    }
    if (rowNumber <= 2) return;
    rows.push(read());
  });
  expect(summaryRow).toEqual({
    username: "Summary: 3 hub(s)",
    hub: "",
    region: "active: 1",
    country: "pending setup: 1",
    password: "no rep: 1",
    status: "",
  });
  expect(rows.map((r) => r.username)).toEqual(
    expect.arrayContaining([
      "ashanti_mampong",
      "london_central",
      "kumasi_central",
    ]),
  );

  const pendingRow = rows.find((r) => r.username === "ashanti_mampong");
  expect(pendingRow!.password).toBe(tempPassword);
  expect(pendingRow!.status).toBe("pending_setup");

  // Activated reps keep their own private password — the cell is blank.
  const activeRow = rows.find((r) => r.username === "london_central");
  expect(activeRow!.password).toBe("");
  expect(activeRow!.status).toBe("active");

  // Hub without a rep: derived underscore username, honest no_rep status.
  const noRepRow = rows.find((r) => r.username === "kumasi_central");
  expect(noRepRow!.hub).toBe("Kumasi Central");
  expect(noRepRow!.password).toBe("");
  expect(noRepRow!.status).toBe("no_rep");
});

test("export data query rejects non-admin roles", async () => {
  const t = createTestConvex();
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Staff",
      email: "staff@example.com",
      passwordHash: "not-a-real-hash",
      role: "registration",
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

  await expect(
    t.query(api.agcAdminData.listHubsRepsExportData, { sessionToken: token }),
  ).rejects.toThrow();
});
