import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

type TestConvex = ReturnType<typeof createTestConvex>;

const base = {
  label: "Accra Tours",
  dateLabel: "Monday, November 1st",
  timeRange: "8:00 AM – 6:00 PM",
  sites: ["First Love Center"],
  meals: "Breakfast snack and lunch",
  priceUsd: 40,
  priceGhs: 600,
  order: 1,
  active: true,
};

/** Seed an admin user + session and return the session token. */
async function adminSession(t: TestConvex): Promise<string> {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Admin",
      email: "tour-admin@example.com",
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
 * Seed a storage file through ctx.storage.store (convex-test's fake HTTP
 * endpoint 404s, but the storage API itself works).
 */
async function seedStorageFile(t: TestConvex): Promise<Id<"_storage">> {
  return t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71])])),
  );
}

test("update with a site-path image succeeds", async () => {
  const t = createTestConvex();
  const token = await adminSession(t);
  const { id } = await t.mutation(api.tourPackages.create, {
    sessionToken: token,
    ...base,
    imageUrl: "/gallery/2025/homecoming-02.jpg",
  });

  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id,
    ...base,
    imageUrl: "/gallery/2025/homecoming-08.jpg",
  });

  const pkg = await t.run((ctx) => ctx.db.get(id as Id<"tourPackages">));
  expect(pkg?.imageUrl).toBe("/gallery/2025/homecoming-08.jpg");
});

test("update with a newly uploaded storage image replaces the old one", async () => {
  const t = createTestConvex();
  const token = await adminSession(t);
  const { id } = await t.mutation(api.tourPackages.create, {
    sessionToken: token,
    ...base,
    label: "Mountain Tours",
  });

  // Stands in for the two-step HTTP upload the admin UI performs.
  const storageId = await seedStorageFile(t);

  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id,
    ...base,
    label: "Mountain Tours",
    imageStorageId: storageId,
  });

  const pkg = await t.run((ctx) => ctx.db.get(id as Id<"tourPackages">));
  expect(pkg?.imageStorageId).toBeDefined();
  expect(pkg?.imageUrl).toBeUndefined();
});

test("storage image wins over a pre-existing site path; clearing removes both", async () => {
  const t = createTestConvex();
  const token = await adminSession(t);
  const { id } = await t.mutation(api.tourPackages.create, {
    sessionToken: token,
    ...base,
    label: "Coastal Tours",
    imageUrl: "/gallery/2025/homecoming-02.jpg",
  });

  // Stands in for the two-step HTTP upload the admin UI performs.
  const storageId = await seedStorageFile(t);

  // The UI's parseDraft always sends imageUrl (undefined when the path box
  // is empty) plus imageStorageId when the user just picked a file.
  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id,
    ...base,
    label: "Coastal Tours",
    imageUrl: undefined,
    imageStorageId: storageId,
  });
  let pkg = await t.run((ctx) => ctx.db.get(id as Id<"tourPackages">));
  expect(pkg?.imageStorageId).toBeDefined();
  expect(pkg?.imageUrl).toBeUndefined();

  // "Remove image" flow: clearImageStorage wipes the stored file and both
  // fields survive as undefined afterwards.
  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id,
    ...base,
    label: "Coastal Tours",
    imageUrl: undefined,
    clearImageStorage: true,
  });
  pkg = await t.run((ctx) => ctx.db.get(id as Id<"tourPackages">));
  expect(pkg?.imageStorageId).toBeUndefined();
  expect(pkg?.imageUrl).toBeUndefined();
});

test("update succeeds even when the stored image file is already gone", async () => {
  const t = createTestConvex();
  const token = await adminSession(t);
  const { id } = await t.mutation(api.tourPackages.create, {
    sessionToken: token,
    ...base,
    label: "Dangling Tours",
  });

  // Attach an image, then delete the file out from under the package —
  // the state that made every admin save fail with a generic error.
  const storageId = await seedStorageFile(t);
  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id,
    ...base,
    label: "Dangling Tours",
    imageStorageId: storageId,
  });
  await t.run(async (ctx) => {
    await ctx.storage.delete(storageId);
  });

  // Save again: replacing with a new upload must succeed...
  const replacement = await seedStorageFile(t);
  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id,
    ...base,
    label: "Dangling Tours",
    imageStorageId: replacement,
  });
  let pkg = await t.run((ctx) => ctx.db.get(id as Id<"tourPackages">));
  expect(pkg?.imageStorageId).toBe(replacement);

  // ...and clearing the image must succeed too.
  await t.mutation(api.tourPackages.update, {
    sessionToken: token,
    id,
    ...base,
    label: "Dangling Tours",
    imageUrl: undefined,
    clearImageStorage: true,
  });
  pkg = await t.run((ctx) => ctx.db.get(id as Id<"tourPackages">));
  expect(pkg?.imageStorageId).toBeUndefined();
});
