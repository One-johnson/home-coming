import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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

/**
 * What the console shows before anyone deletes anything: how much storage is
 * live versus stranded, and the oldest offenders so an admin can sanity-check
 * that the list looks like abandoned uploads rather than real records.
 */
export const getStorageReport = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    const { blobs, orphans } = await findOrphans(ctx, DEFAULT_GRACE_MS);

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
      sample: orphans.slice(0, 10).map((blob) => ({
        id: blob._id,
        size: blob.size,
        createdAt: blob._creationTime,
      })),
    };
  },
});

/**
 * Delete up to `limit` orphaned blobs. Idempotent: each run re-reads the
 * reference set, so anything claimed since the last sweep is left alone.
 */
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

    const { orphans } = await findOrphans(ctx, graceHours * 3_600_000);
    const batch = orphans.slice(0, limit);

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
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: "storage.orphans_swept",
        entityType: "storage",
        summary: `Deleted ${deleted} orphaned file${deleted === 1 ? "" : "s"} (${formatMb(bytesFreed)}) from file storage`,
        metadata: { deleted, failed, bytesFreed, graceHours },
      });
    }

    return {
      deleted,
      failed,
      bytesFreed,
      remaining: Math.max(0, orphans.length - deleted),
    };
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

/** Human-readable bytes for audit summaries ("12.4 MB"). */
function formatMb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
