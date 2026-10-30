import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireRole, sessionTokenValidator } from "./users";
import { requireRep } from "./agcPortal";
import { writeAuditLog } from "./lib/audit";

/**
 * Orphaned file cleanup for Convex file storage.
 *
 * Every receipt, POA evidence image and Excel workbook is uploaded to storage
 * *before* the mutation that records it. When that mutation is rejected — an
 * amount mismatch, a duplicate booking, an expired session, a dropped network —
 * the uploaded blob is never referenced by any row and nothing will ever delete
 * it. Those files are what this module reclaims.
 *
 * Deleting files is unforgiving, so two rules keep it safe:
 *  1. A blob is only an orphan if NO table references it, checked across every
 *     table that can hold a storage id (see `referencedStorageIds`).
 *  2. A blob must be older than the grace window (24h by default). An upload in
 *     flight, or one sitting in an open form waiting to be submitted, is
 *     unreferenced but must not be swept out from under the user.
 */

/** Uploads younger than this are never swept — they may still be claimed. */
const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000;
/** Files deleted per sweep call, so one click can't blow the mutation budget. */
const MAX_BATCH = 500;
/**
 * Batches the nightly cron runs (500 files each), so one night reclaims up to
 * 2,000 stranded uploads instead of taking a week at one batch a night.
 */
export const MAX_NIGHTLY_BATCHES = 4;

/**
 * A payment image is evidence only while the payment is being verified. Once
 * finance confirms it, the durable facts are the amount, reference, date and
 * reviewer — the photo is kept briefly for disputes, then deleted.
 */
export const RECEIPT_RETENTION_DAYS = 15;
const RECEIPT_RETENTION_MS = RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Every storage id that some row currently owns. Keep this in step with
 * `convex/schema.ts` — a missed field here means live files get deleted.
 */
async function referencedStorageIds(
  ctx: QueryCtx | MutationCtx,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  const add = (id: string | null | undefined) => {
    if (id) referenced.add(id);
  };

  // Content: hero slides, gallery albums + images, the about-page portrait and
  // tour package artwork.
  for (const row of await ctx.db.query("heroSlides").collect()) add(row.storageId);
  for (const row of await ctx.db.query("galleries").collect()) add(row.coverStorageId);
  for (const row of await ctx.db.query("galleryImages").collect()) add(row.storageId);
  for (const row of await ctx.db.query("aboutContent").collect()) {
    add(row.firstLadyImageStorageId);
  }
  for (const row of await ctx.db.query("tourPackages").collect()) {
    add(row.imageStorageId);
  }
  // Tour order receipts: uploaded by guests, read by finance in the dashboard.
  for (const row of await ctx.db.query("tourOrders").collect()) {
    add(row.receiptStorageId);
  }

  // AGC money records: the offline payment receipt and the POA evidence image.
  for (const row of await ctx.db.query("agcRegistrations").collect()) {
    add(row.offline?.receiptStorageId);
    add(row.poa?.evidenceStorageId);
  }
  for (const row of await ctx.db.query("agcBookings").collect()) {
    add(row.offline?.receiptStorageId);
    add(row.poa?.evidenceStorageId);
  }

  return referenced;
}

type BlobRow = { _id: string; _creationTime: number; size: number };

/** Unreferenced blobs older than the grace window, oldest first. */
async function findOrphans(ctx: QueryCtx | MutationCtx, graceMs: number) {
  const referenced = await referencedStorageIds(ctx);
  const cutoff = Date.now() - graceMs;
  const blobs = (await ctx.db.system
    .query("_storage")
    .collect()) as unknown as BlobRow[];
  const orphans = blobs
    .filter((blob) => !referenced.has(blob._id) && blob._creationTime <= cutoff)
    .sort((a, b) => a._creationTime - b._creationTime);
  return { blobs, orphans };
}

// ------------------------------------------------------------------
// Retention: payment images expire 15 days after the payment is confirmed
// ------------------------------------------------------------------

type PaymentImageKind = "receipt" | "poa_evidence";

type PaymentImage = {
  table: "agcRegistrations" | "agcBookings";
  recordId: string;
  kind: PaymentImageKind;
  storageId: Id<"_storage">;
  /** When finance confirmed the money — the clock starts here. */
  confirmedAt: number;
  /** Deletes at this moment. */
  expiresAt: number;
  referenceNumber: string | null;
  fileName: string | null;
};

/**
 * Every payment image still attached to a confirmed record, split into the ones
 * past their retention window and the ones still inside it. Only confirmed
 * payments qualify: an image attached to an unverified, rejected or disputed
 * record is evidence and stays until someone acts on it.
 */
async function collectPaymentImages(ctx: QueryCtx | MutationCtx, now: number) {
  const due: PaymentImage[] = [];
  const scheduled: PaymentImage[] = [];

  const consider = (image: Omit<PaymentImage, "expiresAt">) => {
    const expiresAt = image.confirmedAt + RECEIPT_RETENTION_MS;
    const entry: PaymentImage = { ...image, expiresAt };
    if (expiresAt <= now) due.push(entry);
    else scheduled.push(entry);
  };

  for (const record of await ctx.db.query("agcRegistrations").collect()) {
    const confirmedAt = record.confirmedAt ?? record.paidAt;
    if (record.paymentStatus === "confirmed" && record.offline?.receiptStorageId) {
      consider({
        table: "agcRegistrations",
        recordId: record._id,
        kind: "receipt",
        storageId: record.offline.receiptStorageId,
        confirmedAt: confirmedAt ?? record.updatedAt,
        referenceNumber: record.referenceNumber ?? null,
        fileName: record.offline.receiptFileName ?? null,
      });
    }
    if (record.poa?.status === "confirmed" && record.poa.evidenceStorageId) {
      consider({
        table: "agcRegistrations",
        recordId: record._id,
        kind: "poa_evidence",
        storageId: record.poa.evidenceStorageId,
        confirmedAt: record.poa.confirmedAt ?? confirmedAt ?? record.updatedAt,
        referenceNumber: record.referenceNumber ?? null,
        fileName: record.poa.evidenceFileName ?? null,
      });
    }
  }

  for (const booking of await ctx.db.query("agcBookings").collect()) {
    const confirmedAt = booking.confirmedAt ?? booking.paidAt;
    if (booking.paymentStatus === "confirmed" && booking.offline?.receiptStorageId) {
      consider({
        table: "agcBookings",
        recordId: booking._id,
        kind: "receipt",
        storageId: booking.offline.receiptStorageId,
        confirmedAt: confirmedAt ?? booking.updatedAt,
        referenceNumber: booking.referenceNumber ?? null,
        fileName: booking.offline.receiptFileName ?? null,
      });
    }
    if (booking.poa?.status === "confirmed" && booking.poa.evidenceStorageId) {
      consider({
        table: "agcBookings",
        recordId: booking._id,
        kind: "poa_evidence",
        storageId: booking.poa.evidenceStorageId,
        confirmedAt: booking.poa.confirmedAt ?? confirmedAt ?? booking.updatedAt,
        referenceNumber: booking.referenceNumber ?? null,
        fileName: booking.poa.evidenceFileName ?? null,
      });
    }
  }

  return { due, scheduled };
}

/**
 * What the console shows before anyone deletes anything: how much storage is
 * live versus stranded, the oldest offenders so an admin can sanity-check that
 * the list looks like abandoned uploads rather than real records, and how many
 * payment images the retention rule will remove next.
 */
export const getStorageReport = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    const { blobs, orphans } = await findOrphans(ctx, DEFAULT_GRACE_MS);
    const { scheduled } = await collectPaymentImages(ctx, Date.now());

    let totalBytes = 0;
    for (const blob of blobs) totalBytes += blob.size;
    let orphanedBytes = 0;
    for (const blob of orphans) orphanedBytes += blob.size;

    return {
      totalBytes,
      fileCount: blobs.length,
      orphanedFiles: orphans.length,
      orphanedBytes,
      graceHours: DEFAULT_GRACE_MS / 3_600_000,
      oldestOrphanAt: orphans.length > 0 ? orphans[0]._creationTime : null,
      retentionDays: RECEIPT_RETENTION_DAYS,
      awaitingExpiry: scheduled.length,
      nextExpiryAt:
        scheduled.length > 0
          ? Math.min(...scheduled.map((image) => image.expiresAt))
          : null,
      sample: orphans.slice(0, 10).map((blob) => ({
        id: blob._id,
        size: blob.size,
        createdAt: blob._creationTime,
      })),
    };
  },
});

/** Who asked for the sweep — an admin in the console, or the nightly cron. */
type SweepActor = {
  actorUserId?: Id<"users">;
  actorEmail: string;
  /** True for the cron, recorded in the audit entry so nobody is blamed. */
  automatic: boolean;
};

/**
 * Delete up to `limit` orphaned blobs. Idempotent: each run re-reads the
 * reference set, so anything claimed since the last sweep is left alone.
 *
 * The admin button and the nightly cron share this, so both obey the same two
 * rules: never a blob a row points at, never one inside the grace window — and
 * either way an audit entry records what left storage.
 */
async function sweepOrphans(
  ctx: MutationCtx,
  args: { graceMs: number; limit: number; actor: SweepActor },
) {
  const { orphans } = await findOrphans(ctx, args.graceMs);
  const batch = orphans.slice(0, args.limit);

  let deleted = 0;
  let bytesFreed = 0;
  let failed = 0;
  for (const blob of batch) {
    try {
      await ctx.storage.delete(blob._id as Id<"_storage">);
    } catch {
      // Already deleted (a concurrent sweep or a manual dashboard delete) —
      // nothing to reclaim, and it must not abort the rest of the batch.
      failed += 1;
      continue;
    }
    deleted += 1;
    bytesFreed += blob.size;
  }

  if (deleted > 0) {
    await writeAuditLog(ctx, {
      actorUserId: args.actor.actorUserId,
      actorEmail: args.actor.actorEmail,
      action: "storage.orphans_swept",
      entityType: "storage",
      summary: `Deleted ${deleted} orphaned file${deleted === 1 ? "" : "s"} (${formatMb(bytesFreed)}) from file storage`,
      metadata: {
        deleted,
        failed,
        bytesFreed,
        graceHours: args.graceMs / 3_600_000,
        automatic: args.actor.automatic,
      },
    });
  }

  return {
    deleted,
    failed,
    bytesFreed,
    remaining: Math.max(0, orphans.length - deleted),
  };
}

/** Admin button: sweep now, with the caller's identity on the audit entry. */
export const sweepOrphanedFiles = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    limit: v.optional(v.number()),
    graceHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, ["admin"]);

    const graceHours = Math.max(1, args.graceHours ?? DEFAULT_GRACE_MS / 3_600_000);
    const limit = Math.min(
      MAX_BATCH,
      Math.max(1, Math.floor(args.limit ?? MAX_BATCH)),
    );

    return await sweepOrphans(ctx, {
      graceMs: graceHours * 3_600_000,
      limit,
      actor: { actorUserId: actor._id, actorEmail: actor.email, automatic: false },
    });
  },
});

/**
 * One nightly batch, called by `crons.ts` under `nightlyOrphanSweepTick`.
 *
 * No session: the cron is the caller. The audit entry is attributed to
 * "system:storage-sweep" and flagged `automatic`, so the log never suggests a
 * person pressed anything. Each batch is its own transaction, which is why the
 * cron loops these instead of sweeping everything in one mutation.
 */
export const sweepOrphanedFilesBatch = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(
      MAX_BATCH,
      Math.max(1, Math.floor(args.limit ?? MAX_BATCH)),
    );
    return await sweepOrphans(ctx, {
      graceMs: DEFAULT_GRACE_MS,
      limit,
      actor: { actorEmail: "system:storage-sweep", automatic: true },
    });
  },
});

/**
 * Delete one file the caller uploaded but could not attach to a record —
 * the client calls this when a receipt submit fails after the upload. The
 * reference check keeps a buggy or malicious caller from deleting live files.
 */
export const discardUploadedFile = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireRep(ctx, args.sessionToken);

    const referenced = await referencedStorageIds(ctx);
    if (referenced.has(args.storageId)) {
      return { discarded: false as const, reason: "in_use" as const };
    }

    try {
      await ctx.storage.delete(args.storageId);
    } catch {
      // Already gone — the caller's failure path is unaffected either way.
      return { discarded: false as const, reason: "missing" as const };
    }
    return { discarded: true as const, reason: "orphaned" as const };
  },
});

/**
 * Retention rule, run nightly by the cron in `convex/crons.ts`.
 *
 * Deletes the receipt photo / POA evidence of every confirmed payment once
 * RECEIPT_RETENTION_DAYS have passed since confirmation, clears the pointer on
 * the record so it is never processed twice, and writes one audit entry per
 * deleted image — a super admin can always see exactly what left storage, when,
 * and which record it belonged to.
 */
/** Drop the storage pointer so the record never points at a deleted blob. */
async function clearPaymentImagePointer(
  ctx: MutationCtx,
  image: PaymentImage,
  now: number,
) {
  if (image.table === "agcRegistrations") {
    const record = await ctx.db.get(image.recordId as Id<"agcRegistrations">);
    if (!record) return;
    if (image.kind === "receipt" && record.offline) {
      await ctx.db.patch(record._id, {
        offline: { ...record.offline, receiptStorageId: undefined },
        updatedAt: now,
      });
    } else if (image.kind === "poa_evidence" && record.poa) {
      await ctx.db.patch(record._id, {
        poa: { ...record.poa, evidenceStorageId: undefined },
        updatedAt: now,
      });
    }
    return;
  }

  const booking = await ctx.db.get(image.recordId as Id<"agcBookings">);
  if (!booking) return;
  if (image.kind === "receipt" && booking.offline) {
    await ctx.db.patch(booking._id, {
      offline: { ...booking.offline, receiptStorageId: undefined },
      updatedAt: now,
    });
  } else if (image.kind === "poa_evidence" && booking.poa) {
    await ctx.db.patch(booking._id, {
      poa: { ...booking.poa, evidenceStorageId: undefined },
      updatedAt: now,
    });
  }
}

export const purgeExpiredPaymentImages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const { due } = await collectPaymentImages(ctx, now);

    let deleted = 0;
    let failed = 0;
    let bytesFreed = 0;

    for (const image of due) {
      const blob = await ctx.db.system.get(image.storageId);
      try {
        await ctx.storage.delete(image.storageId);
      } catch {
        // Already gone; still clear the pointer below so it stops showing up.
        failed += 1;
      }
      const size = blob?.size ?? 0;
      if (blob) bytesFreed += size;

      await clearPaymentImagePointer(ctx, image, now);

      await writeAuditLog(ctx, {
        actorEmail: "system:receipt-retention",
        action: "storage.payment_image_expired",
        entityType: image.table,
        entityId: image.recordId,
        summary: `Deleted the ${image.kind === "receipt" ? "payment receipt" : "POA payment evidence"}${
          image.fileName ? ` "${image.fileName}"` : ""
        } for ${image.referenceNumber ?? "an unnamed record"} (${formatMb(size)}) — ${RECEIPT_RETENTION_DAYS} days after payment was confirmed`,
        metadata: {
          kind: image.kind,
          storageId: image.storageId,
          fileName: image.fileName,
          sizeBytes: size,
          confirmedAt: image.confirmedAt,
          confirmedDaysAgo: Math.floor(
            (now - image.confirmedAt) / (24 * 60 * 60 * 1000),
          ),
          retentionDays: RECEIPT_RETENTION_DAYS,
          blobMissing: !blob,
        },
      });

      if (blob) deleted += 1;
    }

    return {
      deleted,
      failed,
      bytesFreed,
      retentionDays: RECEIPT_RETENTION_DAYS,
    };
  },
});

/** Human-readable bytes for audit summaries ("12.4 MB"). */
function formatMb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
