import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireRole } from "./users";
import { writeAuditLog } from "./lib/audit";
import { agcOfflineAction } from "./schemaTypes";
import type { AgcOfflineAction } from "./schemaTypes";
import { performCheckIn, performCheckOut } from "./agcCheckin";
import { performChangeRoom } from "./agcRoomAssignments";

/**
 * Offline operations (Phase 2 §19).
 *
 * Only one designated station per building queues operational updates. Each
 * transaction is stored exactly once (txId dedupe), replayed server-side
 * through the same core logic as the live desk, and any failure is flagged
 * as a conflict / rejection for administrative review — never silently
 * dropped. Clients sync when connectivity returns.
 */

const SYNC_ROLES = ["admin", "accommodation", "room_assignment", "checkin"] as const;
const APPROVER_ROLES = ["admin", "accommodation"] as const;
const MAX_BATCH = 25;

export type QueuedTransaction = {
  txId: string;
  staffId: string;
  staffRole?: string;
  building: string;
  action: AgcOfflineAction;
  payload: string;
  originalAt: number;
};

// ------------------------------------------------------------------
// Station designation (§19: one designated station per building)
// ------------------------------------------------------------------

/** Register this device as the designated station for a building. */
export const registerStation = mutation({
  args: {
    sessionToken: v.string(),
    building: v.string(),
    stationName: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [
      ...APPROVER_ROLES,
    ]);
    const building = args.building.trim();
    const stationName = args.stationName.trim();
    if (!building || !stationName) {
      throw new ConvexError("Building and station name are required");
    }

    const existing = await ctx.db
      .query("agcOfflineStations")
      .withIndex("by_building", (q) => q.eq("building", building))
      .collect();
    // Only one designated station per building — re-point the marker.
    for (const station of existing) {
      if (!station.active) {
        await ctx.db.patch(station._id, { active: false });
        continue;
      }
      if (station.stationName !== stationName) {
        await ctx.db.patch(station._id, {
          active: false,
          updatedAt: Date.now(),
        });
      }
    }
    const activeSame = existing.find(
      (s) => s.active && s.stationName === stationName,
    );
    if (activeSame) {
      await ctx.db.patch(activeSame._id, { updatedAt: Date.now() });
      return { stationId: activeSame._id };
    }
    const stationId = await ctx.db.insert("agcOfflineStations", {
      building,
      stationName,
      registeredBy: actor.email,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_offline.station_registered",
      entityType: "agcOfflineStations",
      entityId: stationId,
      summary: `Designated offline station "${stationName}" for ${building}`,
    });
    return { stationId };
  },
});

/** Active stations for the offline banner + admin visibility. */
export const listStations = query({
  args: {},
  handler: async (ctx) => {
    const stations = await ctx.db.query("agcOfflineStations").collect();
    const pending = await ctx.db
      .query("agcOfflineTransactions")
      .withIndex("by_sync_status", (q) => q.eq("syncStatus", "pending"))
      .collect();
    const pendingByBuilding = new Map<string, number>();
    for (const tx of pending) {
      pendingByBuilding.set(tx.building, (pendingByBuilding.get(tx.building) ?? 0) + 1);
    }
    const conflicts = await ctx.db
      .query("agcOfflineTransactions")
      .withIndex("by_sync_status", (q) => q.eq("syncStatus", "conflict"))
      .collect();
    const conflictByBuilding = new Map<string, number>();
    for (const tx of conflicts) {
      conflictByBuilding.set(tx.building, (conflictByBuilding.get(tx.building) ?? 0) + 1);
    }
    const synced = await ctx.db.query("agcOfflineTransactions").collect();
    return stations
      .map((station) => {
        const buildingTxs = synced.filter((tx) => tx.building === station.building && tx.syncStatus === "synced");
        const lastSync = buildingTxs.reduce<number | null>(
          (max, tx) => (tx.syncedAt && (max === null || tx.syncedAt > max) ? tx.syncedAt : max),
          null,
        );
        return {
          _id: station._id,
          building: station.building,
          stationName: station.stationName,
          active: station.active,
          pendingTransactions: pendingByBuilding.get(station.building) ?? 0,
          conflicts: conflictByBuilding.get(station.building) ?? 0,
          lastSuccessfulSync: lastSync,
        };
      })
      .sort((a, b) => a.building.localeCompare(b.building));
  },
});

// ------------------------------------------------------------------
// Queue + sync
// ------------------------------------------------------------------

/**
 * Store an offline transaction batch. The caller declares the station it is
 * device-named for; only the designated station for that building may queue.
 */
export const queueTransactions = mutation({
  args: {
    sessionToken: v.string(),
    building: v.string(),
    stationName: v.string(),
    transactions: v.array(
      v.object({
        txId: v.string(),
        staffId: v.string(),
        staffRole: v.optional(v.string()),
        action: agcOfflineAction,
        payload: v.string(),
        originalAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...SYNC_ROLES]);
    if (args.transactions.length === 0) return { stored: 0, duplicates: 0 };
    if (args.transactions.length > MAX_BATCH) {
      throw new ConvexError(`Send at most ${MAX_BATCH} transactions per sync call`);
    }

    // Designated-station rule (§19).
    const building = args.building.trim();
    const stations = await ctx.db
      .query("agcOfflineStations")
      .withIndex("by_building", (q) => q.eq("building", building))
      .collect();
    const designated = stations.find(
      (s) => s.active && s.stationName === args.stationName.trim(),
    );
    if (!designated) {
      throw new ConvexError(
        `This device is not the designated offline station for ${building}`,
      );
    }

    let stored = 0;
    let duplicates = 0;
    for (const tx of args.transactions) {
      if (!tx.txId.trim() || !tx.staffId.trim()) {
        throw new ConvexError("Every transaction needs a txId and staff id");
      }
      const existing = await ctx.db
        .query("agcOfflineTransactions")
        .withIndex("by_tx", (q) => q.eq("txId", tx.txId))
        .unique();
      if (existing) {
        // Duplicate sync prevention (§19) — silently skip, count separately.
        duplicates += 1;
        continue;
      }
      await ctx.db.insert("agcOfflineTransactions", {
        txId: tx.txId,
        staffId: tx.staffId.trim(),
        staffRole: tx.staffRole,
        building: designated.building,
        action: tx.action,
        payload: tx.payload,
        originalAt: tx.originalAt,
        syncStatus: "pending",
        createdAt: Date.now(),
      });
      stored += 1;
    }
    return { stored, duplicates };
  },
});

type ReplayOutcome =
  | { kind: "stored_applied"; txId: string }
  | { kind: "conflict"; txId: string; reason: string }
  | { kind: "rejected"; txId: string; reason: string };

/** Attempt to replay one stored transaction; returns a typed outcome. */
async function replayTransaction(
  ctx: MutationCtx,
  tx: Doc<"agcOfflineTransactions">,
): Promise<ReplayOutcome> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(tx.payload) as Record<string, unknown>;
  } catch {
    return { kind: "rejected", txId: tx.txId, reason: "Corrupted transaction payload" };
  }

  const actor = {
    email: tx.staffId,
    role: tx.staffRole,
    userId: undefined,
  };

  try {
    switch (tx.action as AgcOfflineAction) {
      case "check_in": {
        await performCheckIn(ctx, actor, {
          guestId: args.guestId as Id<"agcGuests">,
          location: (args.location as string) ?? tx.building,
          override: args.override as { reason: string } | undefined,
          keyRecipientName: args.keyRecipientName as string | undefined,
          offlineTxId: tx.txId,
        });
        break;
      }
      case "check_out": {
        await performCheckOut(ctx, actor, {
          guestId: args.guestId as Id<"agcGuests">,
          keyReturnStatus: args.keyReturnStatus as "returned" | "not_returned" | "not_applicable" | undefined,
          offlineTxId: tx.txId,
        });
        break;
      }
      case "room_change": {
        await performChangeRoom(ctx, actor, {
          guestId: args.guestId as Id<"agcGuests">,
          toRoomId: args.toRoomId as Id<"agcRooms">,
          reason: (args.reason as string) ?? "Offline room change",
          offlineTxId: tx.txId,
        });
        break;
      }
      case "issue_key":
        // Keys are issued through / during check-in (§14); a standalone
        // queued key action is recorded and resolved by an approver.
        await performCheckIn(ctx, actor, {
          guestId: args.guestId as Id<"agcGuests">,
          location: tx.building,
          keyRecipientName: args.keyRecipientName as string | undefined,
          offlineTxId: tx.txId,
        });
        break;
      default:
        return {
          kind: "rejected",
          txId: tx.txId,
          reason: `Unsupported offline action: ${tx.action}`,
        };
    }
    return { kind: "stored_applied", txId: tx.txId };
  } catch (err) {
    return {
      kind: "conflict",
      txId: tx.txId,
      reason: err instanceof Error ? err.message : "Replay failed",
    };
  }
}

/**
 * Replay pending transactions for a building (auto-sync when connectivity
 * returns, or a manual "Sync now" tap). Conflicts are flagged, not applied.
 */
export const syncPendingTransactions = mutation({
  args: { sessionToken: v.string(), building: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...SYNC_ROLES]);
    const pending = (
      await ctx.db
        .query("agcOfflineTransactions")
        .withIndex("by_sync_status", (q) => q.eq("syncStatus", "pending"))
        .collect()
    )
      .filter((tx) => !args.building || tx.building === args.building)
      .sort((a, b) => a.originalAt - b.originalAt)
      .slice(0, MAX_BATCH);

    let applied = 0;
    let conflicts = 0;
    for (const tx of pending) {
      const outcome = await replayTransaction(ctx, tx);
      if (outcome.kind === "stored_applied") {
        await ctx.db.patch(tx._id, {
          syncStatus: "synced",
          syncedAt: Date.now(),
        });
        applied += 1;
      } else if (outcome.kind === "conflict") {
        await ctx.db.patch(tx._id, {
          syncStatus: "conflict",
          conflictReason: outcome.reason,
          syncedAt: Date.now(),
        });
        conflicts += 1;
        await writeAuditLog(ctx, {
          actorEmail: actor.email,
          action: "agc_offline.conflict_flagged",
          entityType: "agcOfflineTransactions",
          entityId: tx._id,
          summary: `Offline transaction flagged for review (${tx.action}, ${tx.txId}): ${outcome.reason}`,
        });
      } else {
        await ctx.db.patch(tx._id, {
          syncStatus: "rejected",
          syncedAt: Date.now(),
          conflictReason: outcome.reason,
        });
      }
    }
    return { applied, conflicts, remaining: Math.max(0, pending.length - applied - conflicts) };
  },
});

/** Offline transactions flagged for administrative review (§19). */
export const listConflicts = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...SYNC_ROLES]);
    const rows = (
      await ctx.db
        .query("agcOfflineTransactions")
        .withIndex("by_sync_status", (q) => q.eq("syncStatus", "conflict"))
        .collect()
    )
      .concat(
        await ctx.db
          .query("agcOfflineTransactions")
          .withIndex("by_sync_status", (q) => q.eq("syncStatus", "rejected"))
          .collect(),
      )
      .sort((a, b) => b.originalAt - a.originalAt)
      .slice(0, 100);
    return rows.map((row) => ({
      _id: row._id,
      txId: row.txId,
      staffId: row.staffId,
      building: row.building,
      action: row.action,
      originalAt: row.originalAt,
      syncStatus: row.syncStatus,
      conflictReason: row.conflictReason ?? null,
      payloadPreview: row.payload.slice(0, 400),
    }));
  },
});

/** Resolve a flagged transaction: fire it (applied) is NOT possible — the
 * conflict is closed by marking it reviewed/applied-as-is or rejected. */
export const resolveConflict = mutation({
  args: {
    sessionToken: v.string(),
    transactionId: v.id("agcOfflineTransactions"),
    resolution: v.union(v.literal("applied"), v.literal("rejected")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...APPROVER_ROLES]);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new ConvexError("Transaction not found");
    await ctx.db.patch(tx._id, {
      syncStatus: args.resolution === "applied" ? "synced" : "rejected",
      syncedAt: Date.now(),
      conflictReason:
        (tx.conflictReason ?? "") +
        ` | resolved as ${args.resolution} by ${actor.email}${args.note ? ` — ${args.note}` : ""}`,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_offline.conflict_resolved",
      entityType: "agcOfflineTransactions",
      entityId: tx._id,
      summary: `Resolved offline ${tx.action} transaction as ${args.resolution} (${tx.txId})`,
      metadata: { note: args.note ?? null },
    });
    return { success: true as const };
  },
});

/** §19 station status panel data for one building. */
export const getStationStatus = query({
  args: { sessionToken: v.string(), building: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...SYNC_ROLES]);
    const stations = await ctx.db
      .query("agcOfflineStations")
      .withIndex("by_building", (q) => q.eq("building", args.building))
      .collect();
    const designated = stations.find((s) => s.active);
    const pendingCount = (
      await ctx.db
        .query("agcOfflineTransactions")
        .withIndex("by_sync_status", (q) => q.eq("syncStatus", "pending"))
        .collect()
    ).filter((tx) => tx.building === args.building).length;
    const buildingTxs = (await ctx.db.query("agcOfflineTransactions").collect()).filter(
      (tx) => tx.building === args.building,
    );
    const syncedTxs = buildingTxs.filter((tx) => tx.syncStatus === "synced");
    const conflictTxs = buildingTxs.filter((tx) => tx.syncStatus === "conflict");
    const rejectedTxs = buildingTxs.filter((tx) => tx.syncStatus === "rejected");
    const lastSync = syncedTxs.reduce<number | null>(
      (max, tx) => (tx.syncedAt && (max === null || tx.syncedAt > max) ? tx.syncedAt : max),
      null,
    );
    return {
      building: args.building,
      designatedStation: designated?.stationName ?? null,
      pendingTransactions: pendingCount,
      lastSuccessfulSync: lastSync,
      conflicts: conflictTxs.length,
      rejections: rejectedTxs.length,
      errors: [
        ...conflictTxs,
        ...rejectedTxs,
      ]
        .filter((tx) => tx.conflictReason)
        .slice(0, 5)
        .map((tx) => ({ txId: tx.txId, reason: tx.conflictReason as string })),
    };
  },
});
