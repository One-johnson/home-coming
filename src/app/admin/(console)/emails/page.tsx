"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { emailExportRow, emailLogColumns } from "@/components/admin/columns";
import { RecordDetailSheet } from "@/components/admin/RecordDetailSheet";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";
import { emailStatusBadgeClass } from "@/lib/adminColors";
import { cn } from "@/lib/utils";

type DeleteTarget =
  | { type: "single"; id: Id<"emailLogs">; label: string }
  | {
      type: "bulk";
      ids: Id<"emailLogs">[];
      clearSelection: () => void;
    };

export default function AdminEmailsPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "emails");
  const emailLogs = useQuery(
    api.emails.listEmailLogs,
    allowed ? sessionArgs : "skip",
  );
  const markSent = useMutation(api.emails.markEmailSent);
  const markFailed = useMutation(api.emails.markEmailFailed);
  const resend = useMutation(api.emails.resendEmail);
  const remove = useMutation(api.emails.remove);
  const bulkRemove = useMutation(api.emails.bulkRemove);
  const [selected, setSelected] = useState<Doc<"emailLogs"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to email logs.
      </p>
    );
  }

  const run = async (
    action: (id: Id<"emailLogs">) => Promise<unknown>,
    id: Id<"emailLogs">,
    success: string,
  ) => {
    if (!sessionToken) return;
    try {
      await action(id);
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "single") {
        await remove({ sessionToken, id: deleteTarget.id });
        toast.success("Email log deleted");
        if (selected?._id === deleteTarget.id) {
          setSelected(null);
        }
      } else {
        const result = await bulkRemove({
          sessionToken,
          ids: deleteTarget.ids,
        });
        toast.success(
          `Deleted ${result.deleted} email log${result.deleted === 1 ? "" : "s"}`,
        );
        if (selected && deleteTarget.ids.includes(selected._id)) {
          setSelected(null);
        }
        deleteTarget.clearSelection();
      }
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
        columns={emailLogColumns}
        data={emailLogs ?? []}
        isLoading={emailLogs === undefined}
        emptyMessage="No email logs yet."
        searchPlaceholder="Search email logs..."
        exportFilename="email-logs.csv"
        exportRow={emailExportRow}
        getRowId={(row) => row._id}
        onRowClick={setSelected}
        facetFilters={[
          {
            columnId: "status",
            title: "Status",
            options: [
              { label: "Pending", value: "pending" },
              { label: "Stub", value: "stub" },
              { label: "Sent", value: "sent" },
              { label: "Failed", value: "failed" },
            ],
          },
        ]}
        bulkActions={({ selectedRows, clearSelection }) => (
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              setDeleteTarget({
                type: "bulk",
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

      <RecordDetailSheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.subject ?? "Email"}
        description={selected?.to}
        fields={
          selected
            ? [
                { label: "To", value: selected.to },
                {
                  label: "Type",
                  value: (
                    <span className="capitalize">
                      {selected.type.replaceAll("_", " ")}
                    </span>
                  ),
                },
                {
                  label: "Status",
                  value: (
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        emailStatusBadgeClass(selected.status),
                      )}
                    >
                      {selected.status}
                    </Badge>
                  ),
                },
                {
                  label: "Reference",
                  value: (
                    <span className="font-mono text-xs">
                      {selected.referenceId ?? "—"}
                    </span>
                  ),
                },
                ...(selected.errorMessage
                  ? [{ label: "Error", value: selected.errorMessage }]
                  : []),
                { label: "Body", value: selected.body, block: true },
                {
                  label: "Created",
                  value: new Date(selected.createdAt).toLocaleString(),
                },
              ]
            : []
        }
        footer={
          selected && sessionToken ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void run(
                    (id) => resend({ sessionToken, id }),
                    selected._id,
                    "Email queued for resend",
                  )
                }
              >
                Resend
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void run(
                    (id) => markSent({ sessionToken, id }),
                    selected._id,
                    "Marked as sent",
                  )
                }
              >
                Mark sent
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void run(
                    (id) => markFailed({ sessionToken, id }),
                    selected._id,
                    "Marked as failed",
                  )
                }
              >
                Mark failed
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  setDeleteTarget({
                    type: "single",
                    id: selected._id,
                    label: selected.subject || selected.to,
                  })
                }
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </>
          ) : null
        }
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.type === "bulk"
            ? `Delete ${deleteTarget.ids.length} email log${deleteTarget.ids.length === 1 ? "" : "s"}?`
            : "Delete email log?"
        }
        description={
          deleteTarget?.type === "bulk"
            ? "Selected email logs will be permanently removed. Pending sends for deleted rows will stop."
            : `“${deleteTarget?.label ?? "This email"}” will be permanently removed.`
        }
        confirmLabel={
          deleteTarget?.type === "bulk"
            ? `Delete ${deleteTarget.ids.length}`
            : "Delete email"
        }
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
