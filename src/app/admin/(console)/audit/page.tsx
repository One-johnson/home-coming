"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { DataTable } from "@/components/ui/data-table";
import { auditLogColumns } from "@/components/admin/columns";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminAuditPage() {
  const { user } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "audit");
  const logs = useQuery(
    api.admin.listAuditLogs,
    allowed ? sessionArgs : "skip",
  );

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to the audit log.
      </p>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <DataTable
        columns={auditLogColumns}
        data={logs ?? []}
        isLoading={logs === undefined}
        emptyMessage="No audit events yet."
        searchPlaceholder="Search audit log..."
        exportFilename="audit-log.csv"
        exportRow={(row) => ({
          when: new Date(row.createdAt).toISOString(),
          actor: row.actorEmail ?? "",
          action: row.action,
          entity: row.entityType,
          entityId: row.entityId ?? "",
          summary: row.summary,
        })}
        getRowId={(row) => row._id}
      />
    </div>
  );
}
