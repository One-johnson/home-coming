"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Archive, ClipboardPen, ScrollText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { DelegateCorrectionsPanel } from "@/components/admin/DelegateCorrectionsPanel";
import { StorageMaintenancePanel } from "@/components/admin/StorageMaintenancePanel";
import { TrashPanel } from "@/components/admin/agc/TrashPanel";
import { auditLogColumns } from "@/components/admin/columns";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";
import { SectionTabs } from "@/components/admin/kit/SectionTabs";

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
  const [section, setSection] = useState<"log" | "corrections" | "housekeeping">(
    "log",
  );
  const isAdmin = user?.role === "admin";

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
      toast.error(cleanErrorMessage(err) || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      <SectionTabs
        label="Audit sections"
        value={section}
        onChange={setSection}
        items={[
          {
            id: "log",
            label: "Activity log",
            icon: ScrollText,
            count: logs?.length,
          },
          { id: "corrections", label: "Delegate corrections", icon: ClipboardPen },
          ...(isAdmin
            ? [{ id: "housekeeping" as const, label: "Housekeeping", icon: Archive }]
            : []),
        ]}
      />

      {/* What the accommodation team changed on a locked reservation, with the
          reasons — the activity log still holds every event. */}
      {section === "corrections" && <DelegateCorrectionsPanel />}

      {section === "housekeeping" && isAdmin && (
        <div className="grid gap-4 xl:grid-cols-2">
          <TrashPanel />
          <StorageMaintenancePanel />
        </div>
      )}

      {section === "log" && (
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
      )}

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
