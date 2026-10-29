import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { createTestConvex } from "./testUtils";

type TestConvex = ReturnType<typeof createTestConvex>;

const base = {
  label: "Aburi day trip",
  dateLabel: "Friday, November 5th",
  timeRange: "Full day",
  sites: ["Aburi Botanical Gardens"],
  meals: "Breakfast snack and lunch",
  priceUsd: 20,
  priceGhs: 300,
  order: 9,
  active: true,
};

async function adminSession(t: TestConvex): Promise<string> {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Admin",
      email: "tour-sync-admin@example.com",
      passwordHash: "not-a-real-hash",
      role: "admin",
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
  return token;
}

/**
 * The admin Tours tab used to run this sync on every mount, and the sync
 * rewrote both seeded packages back to the hardcoded defaults while deleting
 * anything else. Editing a tour was therefore reverted on the next visit and a
 * deleted tour reappeared. Seeding must only ever fill gaps.
 */
test("ensureDefaults adds missing tours but never rewrites an edited one", async () => {
  const t = createTestConvex();
  const token = await adminSession(t);

  const first = await t.mutation(api.tourPackages.ensureDefaults, {
    sessionToken: token,
  });
  expect(first.inserted).toBe(2);

  const seeded = await t.query(api.tourPackages.listAdmin, {
    sessionToken: token,
  });
  const mountain = seeded.find((p) => p.slug === "mountain_thu_nov_4");
  expect(mountain).toBeTruthy();

  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id: mountain!._id,
    ...base,
    label: "Mountain Tours (revised)",
    priceUsd: 55,
    badge: "Mountain",
  });

  const second = await t.mutation(api.tourPackages.ensureDefaults, {
    sessionToken: token,
  });
  expect(second.inserted).toBe(0);

  const after = await t.query(api.tourPackages.listAdmin, {
    sessionToken: token,
  });
  const revised = after.find((p) => p.slug === "mountain_thu_nov_4");
  expect(revised?.label).toBe("Mountain Tours (revised)");
  expect(revised?.priceUsd).toBe(55);
  expect(revised?.sites).toEqual(base.sites);
});

test("a manual sync restores a deleted default but never sweeps away a custom tour", async () => {
  const t = createTestConvex();
  const token = await adminSession(t);
  await t.mutation(api.tourPackages.ensureDefaults, { sessionToken: token });

  const { id: customId } = await t.mutation(api.tourPackages.create, {
    sessionToken: token,
    ...base,
    slug: "aburi_fri_nov_5",
  });

  const seeded = await t.query(api.tourPackages.listAdmin, {
    sessionToken: token,
  });
  const accra = seeded.find((p) => p.slug === "accra_mon_nov_1");
  expect(accra).toBeTruthy();
  await t.mutation(api.tourPackages.remove, {
    sessionToken: token,
    id: accra!._id,
  });

  const result = await t.mutation(api.tourPackages.ensureDefaults, {
    sessionToken: token,
  });

  // The button is "Add missing tours": it restores the deleted Monday tour
  // because an admin asked for it, and it never deletes the custom tour.
  expect(result.inserted).toBe(1);
  expect(result.insertedSlugs).toEqual(["accra_mon_nov_1"]);

  const left = await t.query(api.tourPackages.listAdmin, {
    sessionToken: token,
  });
  expect(left.some((p) => p._id === customId)).toBe(true);
  expect(left.filter((p) => p.slug === "accra_mon_nov_1")).toHaveLength(1);
});
