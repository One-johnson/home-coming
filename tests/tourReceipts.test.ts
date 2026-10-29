import { expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

type TestConvex = ReturnType<typeof createTestConvex>;

const REFERENCE = "TUR-9F3K2A";

async function seedOrder(t: TestConvex) {
  return t.run(async (ctx) => {
    const packageId = await ctx.db.insert("tourPackages", {
      slug: "accra_mon_nov_1",
      label: "Accra Tours",
      dateLabel: "Monday, November 1st",
      timeRange: "Full day",
      sites: ["First Love Center"],
      meals: "Breakfast snack and lunch",
      priceUsd: 40,
      active: true,
      order: 1,
      updatedAt: Date.now(),
    });

    return await ctx.db.insert("tourOrders", {
      fullName: "Guest Booking",
      email: "guest@example.com",
      phone: "0240000000",
      countryCode: "+233",
      region: "Ghana",
      groupName: "Group A",
      denomination: "Denom",
      items: [
        {
          packageId,
          label: "Accra Tours: Monday, November 1st",
          quantity: 1,
          unitPrice: 40,
        },
      ],
      totalAmount: 40,
      currency: "USD",
      gateway: "offline",
      paymentStatus: "pending_payment",
      referenceNumber: REFERENCE,
      consent: true,
      createdAt: Date.now(),
    });
  });
}

async function seedFile(
  t: TestConvex,
  type: string,
  bytes = [137, 80, 78, 71],
): Promise<Id<"_storage">> {
  return t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })),
  );
}

test("a guest attaches a receipt with the matching reference and email", async () => {
  const t = createTestConvex();
  const orderId = await seedOrder(t);
  const storageId = await seedFile(t, "image/png");

  // Reference and email are compared case-insensitively — people retype both.
  await t.mutation(api.tourOrders.attachReceipt, {
    referenceNumber: "tur-9f3k2a",
    email: "  Guest@Example.com ",
    storageId,
    contentType: "image/png",
  });

  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order?.receiptStorageId).toBe(storageId);
  expect(order?.receiptUploadedAt).toBeTypeOf("number");
  expect(order?.paymentStatus).toBe("pending_payment");
});

test("a mismatched email cannot attach a receipt to someone else's order", async () => {
  const t = createTestConvex();
  const orderId = await seedOrder(t);
  const storageId = await seedFile(t, "image/png");

  await expect(
    t.mutation(api.tourOrders.attachReceipt, {
      referenceNumber: REFERENCE,
      email: "stranger@example.com",
      storageId,
    }),
  ).rejects.toThrow(/could not match/i);

  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order?.receiptStorageId).toBeUndefined();
});

test("an unknown reference is rejected even for a real email", async () => {
  const t = createTestConvex();
  await seedOrder(t);
  const storageId = await seedFile(t, "image/png");

  await expect(
    t.mutation(api.tourOrders.attachReceipt, {
      referenceNumber: "TUR-NOTREAL",
      email: "guest@example.com",
      storageId,
    }),
  ).rejects.toThrow(/could not match/i);
});

test("non-image, non-PDF uploads are refused", async () => {
  const t = createTestConvex();
  const orderId = await seedOrder(t);
  const storageId = await seedFile(t, "text/plain");

  await expect(
    t.mutation(api.tourOrders.attachReceipt, {
      referenceNumber: REFERENCE,
      email: "guest@example.com",
      storageId,
      contentType: "text/plain",
    }),
  ).rejects.toThrow(/photo or PDF/i);

  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order?.receiptStorageId).toBeUndefined();
});

test("a PDF receipt is accepted", async () => {
  const t = createTestConvex();
  const orderId = await seedOrder(t);
  const storageId = await seedFile(t, "application/pdf");

  await t.mutation(api.tourOrders.attachReceipt, {
    referenceNumber: REFERENCE,
    email: "guest@example.com",
    storageId,
    contentType: "application/pdf",
  });

  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order?.receiptStorageId).toBe(storageId);
});

test("a guest can look up their own order by reference and email", async () => {
  const t = createTestConvex();
  await seedOrder(t);

  const order = await t.query(api.tourOrders.getStatus, {
    referenceNumber: " tur-9f3k2a ",
    email: "GUEST@example.com",
  });

  expect(order).not.toBeNull();
  expect(order?.referenceNumber).toBe(REFERENCE);
  expect(order?.paymentStatus).toBe("pending_payment");
  expect(order?.totalAmount).toBe(40);
  expect(order?.items).toEqual([
    {
      label: "Accra Tours: Monday, November 1st",
      quantity: 1,
      unitPrice: 40,
    },
  ]);
  expect(order?.receiptUrl).toBeNull();
  // Nothing internal leaks to the public page.
  expect(order).not.toHaveProperty("email");
  expect(order).not.toHaveProperty("_id");
});

test("the lookup answers null for a real reference with the wrong email", async () => {
  const t = createTestConvex();
  await seedOrder(t);

  const wrongEmail = await t.query(api.tourOrders.getStatus, {
    referenceNumber: REFERENCE,
    email: "someone-else@example.com",
  });
  const wrongReference = await t.query(api.tourOrders.getStatus, {
    referenceNumber: "TUR-NOPE00",
    email: "guest@example.com",
  });
  const blank = await t.query(api.tourOrders.getStatus, {
    referenceNumber: "   ",
    email: "guest@example.com",
  });

  expect(wrongEmail).toBeNull();
  expect(wrongReference).toBeNull();
  expect(blank).toBeNull();
});

test("the lookup shows the receipt once one is attached", async () => {
  const t = createTestConvex();
  await seedOrder(t);
  const storageId = await seedFile(t, "image/png");
  await t.mutation(api.tourOrders.attachReceipt, {
    referenceNumber: REFERENCE,
    email: "guest@example.com",
    storageId,
    contentType: "image/png",
  });

  const order = await t.query(api.tourOrders.getStatus, {
    referenceNumber: REFERENCE,
    email: "guest@example.com",
  });

  expect(order?.receiptUrl).toBeTruthy();
  expect(order?.receiptUploadedAt).toBeTypeOf("number");
});

test("the dashboard list exposes the uploaded receipt URL", async () => {
  const t = createTestConvex();
  await seedOrder(t);
  const storageId = await seedFile(t, "image/png");
  await t.mutation(api.tourOrders.attachReceipt, {
    referenceNumber: REFERENCE,
    email: "guest@example.com",
    storageId,
    contentType: "image/png",
  });

  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Admin",
      email: "tours-admin@example.com",
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

  const rows = await t.query(api.tourOrders.list, { sessionToken: token });
  expect(rows).toHaveLength(1);
  expect(rows[0].receiptUrl).toBeTruthy();
  expect(rows[0].receiptStorageId).toBe(storageId);
});

test("replacing a receipt drops the previous blob", async () => {
  const t = createTestConvex();
  const orderId = await seedOrder(t);
  const first = await seedFile(t, "image/png");
  const second = await seedFile(t, "image/jpeg");

  await t.mutation(api.tourOrders.attachReceipt, {
    referenceNumber: REFERENCE,
    email: "guest@example.com",
    storageId: first,
    contentType: "image/png",
  });
  await t.mutation(api.tourOrders.attachReceipt, {
    referenceNumber: REFERENCE,
    email: "guest@example.com",
    storageId: second,
    contentType: "image/jpeg",
  });

  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order?.receiptStorageId).toBe(second);

  const remaining = await t.run((ctx) => ctx.storage.getUrl(first));
  expect(remaining).toBeNull();
});
