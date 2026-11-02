import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireRole, sessionTokenValidator } from "./users";
import { writeAuditLog } from "./lib/audit";

/**
 * The receipts archive (settings → operations).
 *
 * Every payment proof the portal holds lives on a registration or an
 * accommodation booking in one of two places:
 *
 *  - a **paid receipt** — the bank/MoMo receipt a rep uploaded and finance
 *    confirmed (`offline.receiptStorageId`);
 *  - a **POA receipt** — the payment evidence for a pay-on-arrival record
 *    (`poa.evidenceStorageId`).
 *
 * Finance reconciles those from the console one record at a time, which is
 * useless when an auditor asks for everything. This module lists them, feeds
 * the Excel export (`agcReceiptsExcel.ts`) and deletes whole sets on request —
 * always leaving the money itself untouched.
 */

export const receiptFilterValidator = v.union(
  v.literal("all"),
  v.literal("paid"),
  v.literal("poa"),
);

export type ReceiptFilter = "all" | "paid" | "poa";

/** Files deleted per mutation; the client calls again until nothing remains. */
const MAX_PURGE_BATCH = 200;

export type ReceiptRow = {
  record: "registration" | "booking";
  recordId: string;
  receiptKind: "paid" | "poa";
  reference: string;
  hubName: string;
  repUsername: string;
  amount: number;
  currency: string;
  /** When the money was confirmed — null for POA evidence still in review. */
  confirmedAt: number | null;
  poaStatus: "evidence_submitted" | "confirmed" | null;
  fileName: string | null;
  contentType: string | null;
  storageId: Id<"_storage">;
};

/**
 * Every receipt file on every live record, newest confirmation first. Soft
 * deleted rows are skipped: their receipts were already dropped with them.
 */
async function collectReceipts(
  ctx: QueryCtx | MutationCtx,
  filter: ReceiptFilter,
): Promise<ReceiptRow[]> {
  const hubNames = new Map<string, string>();
  for (const hub of await ctx.db.query("agcHubs").collect()) {
    hubNames.set(String(hub._id), hub.name);
  }
  const repUsernames = new Map<string, string>();
  for (const rep of await ctx.db.query("agcRepresentatives").collect()) {
    repUsernames.set(String(rep._id), rep.username);
  }

  const wantPaid = filter !== "poa";
  const wantPoa = filter !== "paid";
  const rows: ReceiptRow[] = [];

  const push = (
    base: Omit<ReceiptRow, "receiptKind" | "poaStatus" | "storageId" | "fileName" | "contentType" | "confirmedAt">,
    details: {
      receiptKind: "paid" | "poa";
      poaStatus: "evidence_submitted" | "confirmed" | null;
      storageId: Id<"_storage">;
      fileName: string | null;
      contentType: string | null;
      confirmedAt: number | null;
    },
  ) => rows.push({ ...base, ...details });

  for (const record of await ctx.db.query("agcRegistrations").collect()) {
    if (record.deletedAt) continue;
    const base = {
      record: "registration" as const,
      recordId: String(record._id),
      reference:
        record.referenceNumber ?? record.offline?.referenceNumber ?? String(record._id),
      hubName: hubNames.get(String(record.hubId)) ?? "Unknown hub",
      repUsername: repUsernames.get(String(record.repId)) ?? "—",
      amount: record.totalAmount,
      currency: record.currency,
    };
    if (
      wantPaid &&
      record.paymentStatus === "confirmed" &&
      record.offline?.receiptStorageId
    ) {
      push(base, {
        receiptKind: "paid",
        poaStatus: null,
        storageId: record.offline.receiptStorageId,
        fileName: record.offline.receiptFileName ?? null,
        contentType: record.offline.receiptContentType ?? null,
        confirmedAt: record.confirmedAt ?? record.paidAt ?? null,
      });
    }
    if (wantPoa && record.poa?.evidenceStorageId) {
      push(base, {
        receiptKind: "poa",
        poaStatus: record.poa.status === "confirmed" ? "confirmed" : "evidence_submitted",
        storageId: record.poa.evidenceStorageId,
        fileName: record.poa.evidenceFileName ?? null,
        contentType: record.poa.evidenceContentType ?? null,
        confirmedAt: record.poa.confirmedAt ?? null,
      });
    }
  }

  for (const booking of await ctx.db.query("agcBookings").collect()) {
    if (booking.deletedAt) continue;
    const base = {
      record: "booking" as const,
      recordId: String(booking._id),
      reference:
        booking.referenceNumber ?? booking.offline?.referenceNumber ?? String(booking._id),
      hubName: hubNames.get(String(booking.hubId)) ?? "Unknown hub",
      repUsername: repUsernames.get(String(booking.repId)) ?? "—",
      amount: booking.totalAmount,
      currency: booking.currency,
    };
    if (
      wantPaid &&
      booking.paymentStatus === "confirmed" &&
      booking.offline?.receiptStorageId
    ) {
      push(base, {
        receiptKind: "paid",
        poaStatus: null,
        storageId: booking.offline.receiptStorageId,
        fileName: booking.offline.receiptFileName ?? null,
        contentType: booking.offline.receiptContentType ?? null,
        confirmedAt: booking.confirmedAt ?? booking.paidAt ?? null,
      });
    }
    if (wantPoa && booking.poa?.evidenceStorageId) {
      push(base, {
        receiptKind: "poa",
        poaStatus: booking.poa.status === "confirmed" ? "confirmed" : "evidence_submitted",
        storageId: booking.poa.evidenceStorageId,
        fileName: booking.poa.evidenceFileName ?? null,
        contentType: booking.poa.evidenceContentType ?? null,
        confirmedAt: booking.poa.confirmedAt ?? null,
      });
    }
  }

  rows.sort((a, b) => (b.confirmedAt ?? 0) - (a.confirmedAt ?? 0));
  return rows;
}

/**
 * What the operations card shows before anything is downloaded or deleted:
 * how many receipt files exist on each side and how much space they take.
 */
export const getReceiptStats = query({
  args: { sessionToken: sessionTokenValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);

    const rows = await collectReceipts(ctx, "all");
    let paidCount = 0;
    let paidBytes = 0;
    let poaCount = 0;
    let poaBytes = 0;
    let poaAwaitingConfirmation = 0;
    let missingFiles = 0;

    for (const row of rows) {
      const blob = await ctx.db.system.get(row.storageId);
      const size = blob?.size ?? 0;
      if (!blob) missingFiles += 1;
      if (row.receiptKind === "paid") {
        paidCount += 1;
        paidBytes += size;
      } else {
        poaCount += 1;
        poaBytes += size;
        if (row.poaStatus === "evidence_submitted") poaAwaitingConfirmation += 1;
      }
    }

    return {
      paid: { count: paidCount, bytes: paidBytes },
      poa: { count: poaCount, bytes: poaBytes, awaitingConfirmation: poaAwaitingConfirmation },
      missingFiles,
    };
  },
});

/** Rows for the Excel action — the action itself has no database access. */
export const getReceiptRowsForExport = internalQuery({
  args: { sessionToken: v.string(), filter: receiptFilterValidator },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["admin"]);
    const rows = await collectReceipts(ctx, args.filter);
    return { rows, filter: args.filter };
  },
});

/** Drop the storage pointer so a record never points at a deleted blob. */
async function clearReceiptPointer(
  ctx: MutationCtx,
  row: ReceiptRow,
  now: number,
): Promise<boolean> {
  if (row.record === "registration") {
    const record = await ctx.db.get(row.recordId as Id<"agcRegistrations">);
    if (!record) return false;
    if (row.receiptKind === "paid" && record.offline?.receiptStorageId) {
      await ctx.db.patch(record._id, {
        offline: { ...record.offline, receiptStorageId: undefined },
        updatedAt: now,
      });
      return true;
    }
    if (row.receiptKind === "poa" && record.poa?.evidenceStorageId) {
      await ctx.db.patch(record._id, {
        poa: { ...record.poa, evidenceStorageId: undefined },
        updatedAt: now,
      });
      return true;
    }
    return false;
  }

  const booking = await ctx.db.get(row.recordId as Id<"agcBookings">);
  if (!booking) return false;
  if (row.receiptKind === "paid" && booking.offline?.receiptStorageId) {
    await ctx.db.patch(booking._id, {
      offline: { ...booking.offline, receiptStorageId: undefined },
      updatedAt: now,
    });
    return true;
  }
  if (row.receiptKind === "poa" && booking.poa?.evidenceStorageId) {
    await ctx.db.patch(booking._id, {
      poa: { ...booking.poa, evidenceStorageId: undefined },
      updatedAt: now,
    });
    return true;
  }
  return false;
}

/** Human-readable bytes for the audit summary ("12.4 MB"). */
function formatMb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Delete a whole set of receipt files — paid receipts or POA receipts — and
 * clear their pointers. The payments themselves (amount, currency, status,
 * confirmation) are never touched: this removes the proof images, not the
 * money. Every run leaves one audit entry naming what left storage.
 */
export const purgeReceipts = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    filter: receiptFilterValidator,
    /** Files deleted per call; the client repeats until `remaining` is 0. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.filter === "all") {
      throw new ConvexError("Choose paid receipts or POA receipts to delete");
    }
    const actor = await requireRole(ctx, args.sessionToken, ["admin"]);

    const all = await collectReceipts(ctx, args.filter);
    const limit = Math.min(
      MAX_PURGE_BATCH,
      Math.max(1, Math.floor(args.limit ?? MAX_PURGE_BATCH)),
    );
    const rows = all.slice(0, limit);
    const now = Date.now();
    let deleted = 0;
    let failed = 0;
    let bytesFreed = 0;
    let cleared = 0;

    for (const row of rows) {
      const blob = await ctx.db.system.get(row.storageId);
      try {
        await ctx.storage.delete(row.storageId);
        deleted += 1;
        bytesFreed += blob?.size ?? 0;
      } catch {
        // Already gone — still clear the pointer below so it stops showing up.
        failed += 1;
      }
      if (await clearReceiptPointer(ctx, row, now)) cleared += 1;
    }

    if (deleted > 0 || cleared > 0) {
      const label = args.filter === "paid" ? "paid receipt" : "POA receipt";
      await writeAuditLog(ctx, {
        actorUserId: actor._id,
        actorEmail: actor.email,
        action: args.filter === "paid" ? "receipts.paid_purged" : "receipts.poa_purged",
        entityType: "agcReceipts",
        summary: `Deleted ${deleted} ${label} file${deleted === 1 ? "" : "s"} (${formatMb(bytesFreed)}) from the receipts archive`,
        metadata: {
          filter: args.filter,
          deleted,
          failed,
          pointersCleared: cleared,
          bytesFreed,
          references: rows.slice(0, 200).map((row) => row.reference),
        },
      });
    }

    return {
      deleted,
      failed,
      bytesFreed,
      cleared,
      remaining: Math.max(0, all.length - rows.length),
    };
  },
});