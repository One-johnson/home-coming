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

test("export workbook includes hubs, reps, passwords, and both pending-setup states", async () => {
  const t = createTestConvex();
  const token = await seedAdminSession(t);

  const pendingHubId = await seedHub(t, "Ashanti Mampong", "ghana");
  const activeHubId = await seedHub(t, "London Central", "england");

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

  // Hubs sheet: one row per hub with region + country.
  const hubsSheet = workbook.getWorksheet("Hubs");
  expect(hubsSheet).toBeDefined();
  const hubNames = hubsSheet!.getColumn(1).values.slice(2);
  expect(hubNames).toContain("Ashanti Mampong");
  expect(hubNames).toContain("London Central");

  // Representatives sheet: every hub with a rep, password only while
  // the account is still pending setup.
  const repsSheet = workbook.getWorksheet("Representatives");
  expect(repsSheet).toBeDefined();
  const rows: Array<Record<string, string>> = [];
  repsSheet!.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    rows.push({
      username: String(values[1] ?? ""),
      hub: String(values[2] ?? ""),
      password: String(values[3] ?? ""),
    });
  });
  expect(rows.map((r) => r.username)).toEqual(
    expect.arrayContaining(["ashanti_mampong", "london_central"]),
  );

  const pendingRow = rows.find((r) => r.username === "ashanti_mampong");
  expect(pendingRow!.password).toBe(tempPassword);

  // Activated reps keep their own private password — the cell is blank.
  const activeRow = rows.find((r) => r.username === "london_central");
  expect(activeRow!.password).toBe("");
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
