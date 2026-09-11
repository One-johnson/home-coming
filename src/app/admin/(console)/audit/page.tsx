"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { auditLogColumns } from "@/components/admin/columns";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

type DeleteTarget = {
  ids: Id<"auditLogs">[];
  clearSelection: () => void;
};

export default function AdminAuditPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "audit");
  const logs = useQuery(
    api.admin.listAuditLogs,
    allowed ? sessionArgs : "skip",
  );
  const bulkRemove = useMutation(api.admin.bulkRemoveAuditLogs);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to the audit log.
      </p>
    );
  }

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      const result = await bulkRemove({
        sessionToken,
        ids: deleteTarget.ids,
      });
      toast.success(
        `Deleted ${result.deleted} audit event${result.deleted === 1 ? "" : "s"}`,
      );
      deleteTarget.clearSelection();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

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
        bulkActions={({ selectedRows, clearSelection }) => (
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              setDeleteTarget({
                ids: selectedRows.map((r) => r._id),
                clearSelection,
              })
            }
          >
            <Trash2 className="size-4" />
            Delete selected
          </Button>
        )}
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.ids.length ?? 0} audit event${(deleteTarget?.ids.length ?? 0) === 1 ? "" : "s"}?`}
        description="Selected audit events will be permanently removed. This cannot be undone."
        confirmLabel={`Delete ${deleteTarget?.ids.length ?? 0}`}
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
