"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { emailExportRow, emailLogColumns } from "@/components/admin/columns";
import { RecordDetailSheet } from "@/components/admin/RecordDetailSheet";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";
import { emailStatusBadgeClass } from "@/lib/adminColors";
import { cn } from "@/lib/utils";

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
  const [selected, setSelected] = useState<Doc<"emailLogs"> | null>(null);

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
            </>
          ) : null
        }
      />
    </div>
  );
}
