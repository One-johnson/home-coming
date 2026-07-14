import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function writeAuditLog(
  ctx: MutationCtx,
  entry: {
    actorUserId?: Id<"users">;
    actorEmail?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLogs", {
    actorUserId: entry.actorUserId,
    actorEmail: entry.actorEmail,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
    createdAt: Date.now(),
  });
}
