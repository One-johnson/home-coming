import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { createTestConvex } from "./testUtils";

/**
 * Orphaned file cleanup: a blob no row references may be deleted, a blob a row
 * owns never may, and nothing inside the grace window is touched.
 */

type TestConvex = ReturnType<typeof createTestConvex>;

const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

async function seedAdmin(t: TestConvex) {
  const { createHash, randomBytes } = await import("node:crypto");
  const token = createHash("sha256").update(randomBytes(24)).digest("hex");
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "admin",
      email: "admin@example.com",
      passwordHash: "not-a-real-hash",
      role: "admin",
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      // Long-lived: this test pushes the clock past the sweep grace window.
      expiresAt: Date.now() + 30 * DAY_MS,
      createdAt: Date.now(),
    });
  });
  return { token };
}

/** Move the clock forward so uploads fall outside the sweep grace window. */
function advanceDays(days: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + days * DAY_MS);
}

test("sweep deletes only unreferenced blobs past the grace window", async () => {
  const t = createTestConvex();
  const admin = await seedAdmin(t);

  const receiptId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["receipt-bytes"])),
  );
  const orphanId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["left-over upload"])),
  );

  // The receipt is claimed by a content row; the other blob is claimed by
  // nothing, exactly like an upload whose submit was rejected.
  await t.run(async (ctx) => {
    await ctx.db.insert("heroSlides", {
      storageId: receiptId,
      alt: "Referenced",
      order: 0,
    });
  });

  // Fresh uploads are inside the grace window and must not be reported.
  const fresh = await t.query(api.storageMaintenance.getStorageReport, {
    sessionToken: admin.token,
  });
  expect(fresh.fileCount).toBe(2);
  expect(fresh.orphanedFiles).toBe(0);

  advanceDays(2);

  const stale = await t.query(api.storageMaintenance.getStorageReport, {
    sessionToken: admin.token,
  });
  expect(stale.orphanedFiles).toBe(1);
  expect(stale.orphanedBytes).toBeGreaterThan(0);

  const result = await t.mutation(api.storageMaintenance.sweepOrphanedFiles, {
    sessionToken: admin.token,
  });
  expect(result.deleted).toBe(1);
  expect(result.failed).toBe(0);
  expect(result.bytesFreed).toBeGreaterThan(0);
  expect(result.remaining).toBe(0);

  const [survivor, removed] = await t.run((ctx) =>
    Promise.all([ctx.db.system.get(receiptId), ctx.db.system.get(orphanId)]),
  );
  expect(survivor).not.toBeNull();
  expect(removed).toBeNull();

  const logs = await t.run((ctx) => ctx.db.query("auditLogs").collect());
  expect(logs.map((log) => log.action)).toContain("storage.orphans_swept");
});

test("discardUploadedFile removes an unclaimed upload but never a live file", async () => {
  const t = createTestConvex();

  const token = "rep-session-token";
  const referencedId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["live"])),
  );
  const strandedId = await t.run((ctx) => ctx.storage.store(new Blob(["dead"])));

  await t.run(async (ctx) => {
    const hubId = await ctx.db.insert("agcHubs", {
      name: "Test Hub",
      region: "ghana",
      country: "Ghana",
      active: true,
      createdAt: Date.now(),
    });
    const repId = await ctx.db.insert("agcRepresentatives", {
      hubId,
      username: "rep_hub",
      passwordHash: "not-a-real-hash",
      profileComplete: true,
      mustChangePassword: false,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("agcRepSessions", {
      repId,
      token,
      expiresAt: Date.now() + 3_600_000,
      createdAt: Date.now(),
    });
    await ctx.db.insert("heroSlides", {
      storageId: referencedId,
      alt: "Referenced",
      order: 0,
    });
  });

  const refused = await t.mutation(
    api.storageMaintenance.discardUploadedFile,
    { sessionToken: token, storageId: referencedId as Id<"_storage"> },
  );
  expect(refused.discarded).toBe(false);
  expect(refused.reason).toBe("in_use");

  const discarded = await t.mutation(
    api.storageMaintenance.discardUploadedFile,
    { sessionToken: token, storageId: strandedId as Id<"_storage"> },
  );
  expect(discarded.discarded).toBe(true);

  const gone = await t.run((ctx) => ctx.db.system.get(strandedId));
  expect(gone).toBeNull();
});

test("payment images delete 10 days after confirmation, one audit entry each", async () => {
  const t = createTestConvex();
  const admin = await seedAdmin(t);

  const expiredId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["expired receipt"])),
  );
  const freshId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["recent receipt"])),
  );
  const unverifiedId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["still being verified"])),
  );
  const evidenceId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["poa evidence"])),
  );

  const now = Date.now();
  const elevenDaysAgo = now - 11 * DAY_MS;
  const threeDaysAgo = now - 3 * DAY_MS;

  const { expiredRegId, freshRegId, unverifiedRegId, bookingId } = await t.run(
    async (ctx) => {
      const hubId = await ctx.db.insert("agcHubs", {
        name: "Test Hub",
        region: "ghana",
        country: "Ghana",
        active: true,
        createdAt: now,
      });
      const repId = await ctx.db.insert("agcRepresentatives", {
        hubId,
        username: "rep_hub",
        passwordHash: "not-a-real-hash",
        profileComplete: true,
        mustChangePassword: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      const registration = (opts: {
        referenceNumber: string;
        paymentStatus: "confirmed" | "pending_verification";
        confirmedAt?: number;
        receiptStorageId: Id<"_storage">;
      }) =>
        ctx.db.insert("agcRegistrations", {
          hubId,
          repId,
          region: "ghana",
          quantity: 1,
          unitPrice: 100,
          currency: "GHS",
          totalAmount: 100,
          paymentMode: "offline",
          paymentStatus: opts.paymentStatus,
          referenceNumber: opts.referenceNumber,
          confirmedAt: opts.confirmedAt,
          paidAt: opts.confirmedAt,
          offline: {
            amountPaid: 100,
            referenceNumber: "MOMO-1",
            paymentDate: "2026-10-01",
            method: "momo",
            receiptStorageId: opts.receiptStorageId,
            receiptFileName: "receipt.webp",
          },
          createdAt: now,
          updatedAt: now,
        });

      const expiredRegId = await registration({
        referenceNumber: "AGC-EXPIRED",
        paymentStatus: "confirmed",
        confirmedAt: elevenDaysAgo,
        receiptStorageId: expiredId as Id<"_storage">,
      });
      const freshRegId = await registration({
        referenceNumber: "AGC-FRESH",
        paymentStatus: "confirmed",
        confirmedAt: threeDaysAgo,
        receiptStorageId: freshId as Id<"_storage">,
      });
      const unverifiedRegId = await registration({
        referenceNumber: "AGC-UNVERIFIED",
        paymentStatus: "pending_verification",
        confirmedAt: elevenDaysAgo,
        receiptStorageId: unverifiedId as Id<"_storage">,
      });

      // A booking whose POA evidence was confirmed 11 days ago.
      const bookingId = await ctx.db.insert("agcBookings", {
        hubId,
        repId,
        region: "ghana",
        currency: "GHS",
        totalAmount: 100,
        paymentMode: "payment_on_arrival",
        paymentStatus: "confirmed",
        bookingStatus: "confirmed",
        referenceNumber: "ACC-EXPIRED",
        confirmedAt: elevenDaysAgo,
        poa: {
          status: "confirmed",
          evidenceStorageId: evidenceId as Id<"_storage">,
          evidenceFileName: "evidence.webp",
          confirmedAt: elevenDaysAgo,
        },
        createdAt: now,
        updatedAt: now,
      });

      return { expiredRegId, freshRegId, unverifiedRegId, bookingId };
    },
  );

  await t.mutation(internal.storageMaintenance.purgeExpiredPaymentImages, {});

  const [expired, fresh, unverified, evidence] = await t.run((ctx) =>
    Promise.all([
      ctx.db.system.get(expiredId),
      ctx.db.system.get(freshId),
      ctx.db.system.get(unverifiedId),
      ctx.db.system.get(evidenceId),
    ]),
  );
  expect(expired).toBeNull();
  expect(evidence).toBeNull();
  expect(fresh).not.toBeNull();
  expect(unverified).not.toBeNull();

  // Pointers are cleared so nothing points at a deleted blob.
  const [reg, booking, freshReg, unverifiedReg] = await t.run((ctx) =>
    Promise.all([
      ctx.db.get(expiredRegId),
      ctx.db.get(bookingId),
      ctx.db.get(freshRegId),
      ctx.db.get(unverifiedRegId),
    ]),
  );
  expect(reg?.offline?.receiptStorageId).toBeUndefined();
  expect(reg?.offline?.receiptFileName).toBe("receipt.webp");
  expect(booking?.poa?.evidenceStorageId).toBeUndefined();
  expect(freshReg?.offline?.receiptStorageId).toBe(freshId);
  expect(unverifiedReg?.offline?.receiptStorageId).toBe(unverifiedId);

  // One audit entry per deleted image, named against its record.
  const logs = await t.run((ctx) =>
    ctx.db
      .query("auditLogs")
      .collect()
      .then((rows) =>
        rows.filter((row) => row.action === "storage.payment_image_expired"),
      ),
  );
  expect(logs).toHaveLength(2);
  const entityIds = logs.map((log) => log.entityId).sort();
  expect(entityIds).toEqual([expiredRegId, bookingId].sort());
  expect(logs.every((log) => log.actorEmail === "system:receipt-retention")).toBe(
    true,
  );
  expect(logs.map((log) => JSON.parse(log.metadata ?? "{}").kind).sort()).toEqual(
    ["poa_evidence", "receipt"],
  );

  // The report tells admins what the rule will remove and when.
  const report = await t.query(api.storageMaintenance.getStorageReport, {
    sessionToken: admin.token,
  });
  expect(report.retentionDays).toBe(10);
  expect(report.awaitingExpiry).toBe(1);
  expect(report.nextExpiryAt).toBe(threeDaysAgo + 10 * DAY_MS);
});

test("only admins can read the storage report or run a sweep", async () => {
  const t = createTestConvex();
  await expect(() =>
    t.query(api.storageMaintenance.getStorageReport, { sessionToken: "nope" }),
  ).rejects.toThrow();
  await expect(() =>
    t.mutation(api.storageMaintenance.sweepOrphanedFiles, {
      sessionToken: "nope",
    }),
  ).rejects.toThrow();
});
