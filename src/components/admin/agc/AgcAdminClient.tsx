"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ColumnDef } from "@tanstack/react-table";
import { DownloadIcon, Loader2Icon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Textarea } from "@/components/ui/textarea";
import { createActionsColumn, multiSelectFilter } from "@/components/admin/columns";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { paymentStatusMeta } from "@/lib/agcPortal";

type AdminRegistrationRow = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  region: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  totalAmount: number;
  paymentMode: string;
  paymentStatus: string;
  adminMessage: string | null;
  offline: {
    amountPaid: number;
    referenceNumber: string;
    paymentDate: string;
    method: string;
    receiptFileName?: string;
  } | null;
  receiptUrl: string | null;
  createdAt: number;
  paidAt: number | null;
};

type RegistrationDeleteTarget =
  | { kind: "single"; row: AdminRegistrationRow }
  | {
      kind: "bulk";
      rows: AdminRegistrationRow[];
      clearSelection: () => void;
    };

export type ReviewDecision =
  | "approve"
  | "reject"
  | "request_correction";

export function ReviewActions({
  onDecision,
  disabled,
}: {
  onDecision: (decision: ReviewDecision, message?: string) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="mt-3 space-y-2">
      <Textarea
        rows={2}
        placeholder="Optional message to the representative (required for correction requests)"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onDecision("approve", message || undefined)}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !message.trim()}
          onClick={() => onDecision("request_correction", message)}
          className="border-orange-400 text-orange-700 hover:bg-orange-50"
        >
          Request correction
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={disabled}
          onClick={() => onDecision("reject", message || undefined)}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Registrations review table for the Registrations admin page. */
export default function RegistrationsTab() {
  const { sessionToken } = useAdminSession();
  const rows = useQuery(
    api.agcAdminData.listAgcRegistrationsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const review = useMutation(api.agcAdminData.reviewAgcRegistration);
  const deleteOne = useMutation(api.agcAdminData.deleteAgcRegistration);
  const deleteBulk = useMutation(api.agcAdminData.deleteAgcRegistrationsBulk);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RegistrationDeleteTarget | null>(null);

  const decide = async (
    row: AdminRegistrationRow,
    decision: ReviewDecision,
    message?: string,
  ) => {
    if (!sessionToken) return;
    setBusyId(row._id);
    try {
      await review({
        sessionToken,
        registrationId: row._id as Id<"agcRegistrations">,
        decision,
        message,
      });
      toast.success(`Registration ${decision.replace(/_/g, " ")}d`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Review failed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteOne = (row: AdminRegistrationRow) => {
    setDeleteTarget({ kind: "single", row });
  };

  const handleBulkDelete = (
    selectedRows: AdminRegistrationRow[],
    clearSelection: () => void,
  ) => {
    setDeleteTarget({ kind: "bulk", rows: selectedRows, clearSelection });
  };

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      if (target.kind === "single") {
        const row = target.row;
        setBusyId(row._id);
        try {
          await deleteOne({
            sessionToken,
            registrationId: row._id as Id<"agcRegistrations">,
          });
          toast.success("Registration deleted");
          setDeleteTarget(null);
        } catch (err) {
          toast.error(...toastFriendlyErrorParts(err, "Delete failed"));
        } finally {
          setBusyId(null);
        }
      } else {
        try {
          const result = await deleteBulk({
            sessionToken,
            ids: target.rows.map((r) => r._id as Id<"agcRegistrations">),
          });
          toast.success(`Deleted ${result.deleted} registration(s)`);
          target.clearSelection();
          setDeleteTarget(null);
        } catch (err) {
          toast.error(...toastFriendlyErrorParts(err, "Bulk delete failed"));
        }
      }
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<ColumnDef<AdminRegistrationRow>[]>(
    () => [
      {
        accessorKey: "referenceNumber",
        header: "Reference",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.referenceNumber || "(pending)"}
          </span>
        ),
      },
      { accessorKey: "hubName", header: "Hub" },
      {
        accessorKey: "region",
        header: "Region",
        filterFn: multiSelectFilter,
        cell: ({ row }) => (
          <span className="capitalize">
            {row.original.region.replace(/_/g, " ")}
          </span>
        ),
      },
      { accessorKey: "quantity", header: "Delegates" },
      {
        id: "total",
        accessorFn: (row) => row.totalAmount,
        header: "Total",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.currency} {row.original.totalAmount}
          </span>
        ),
      },
      {
        accessorKey: "paymentMode",
        header: "Mode",
        filterFn: multiSelectFilter,
        cell: ({ row }) => (
          <span className="capitalize">
            {row.original.paymentMode.replace(/_/g, " ")}
          </span>
        ),
      },
      {
        accessorKey: "paymentStatus",
        header: "Status",
        filterFn: multiSelectFilter,
        cell: ({ row }) => {
          const status = paymentStatusMeta(row.original.paymentStatus);
          return (
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      createActionsColumn<AdminRegistrationRow>((row) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busyId === row._id}
          aria-label={`Delete registration ${row.referenceNumber || row.hubName}`}
          onClick={() => void handleDeleteOne(row)}
        >
          <Trash2 className="size-4" />
        </Button>
      )),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over stable session/mutations
    [busyId, sessionToken],
  );

  const renderSubRow = (row: AdminRegistrationRow) => (
    <div className="space-y-2">
      {row.offline && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p>
            Amount paid:{" "}
            <strong>
              {row.currency} {row.offline.amountPaid}
            </strong>{" "}
            · {row.offline.method.replace(/_/g, " ")} · {row.offline.paymentDate}
          </p>
          <p className="text-muted-foreground">
            Txn ref: {row.offline.referenceNumber}
          </p>
          {row.receiptUrl && (
            <a
              href={row.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-primary hover:underline"
            >
              View receipt ({row.offline.receiptFileName})
            </a>
          )}
        </div>
      )}
      {row.adminMessage && (
        <p className="rounded bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-300">
          Last message: {row.adminMessage}
        </p>
      )}
      {/* Decided rows show as confirmed rows — actions only while a payment
          is awaiting review. */}
      {row.paymentStatus === "pending_verification" && (
        <ReviewActions
          disabled={busyId === row._id}
          onDecision={(decision, message) => void decide(row, decision, message)}
        />
      )}
    </div>
  );

  return (
    <Card className="p-4">
      <DataTable
        columns={columns}
        data={rows ?? []}
        isLoading={rows === undefined}
        emptyMessage="No registrations yet."
        searchPlaceholder="Search reference, hub…"
        getRowId={(row) => row._id}
        onRowClick={(row) =>
          setExpandedId((prev) => (prev === row._id ? null : row._id))
        }
        renderSubRow={renderSubRow}
        expandedId={expandedId}
        exportFilename="agc-registrations.csv"
        exportRow={(row) => ({
          reference: row.referenceNumber,
          hub: row.hubName,
          region: row.region,
          delegates: row.quantity,
          unitPrice: row.unitPrice,
          total: row.totalAmount,
          currency: row.currency,
          mode: row.paymentMode,
          status: row.paymentStatus,
          createdAt: new Date(row.createdAt).toISOString(),
        })}
        facetFilters={[
          {
            columnId: "region",
            title: "Region",
            options: [
              "ghana",
              "west_africa",
              "rest_of_africa",
              "north_america",
              "england",
              "switzerland",
              "rest_of_europe",
              "rest_of_world",
            ].map((value) => ({
              value,
              label: value.replace(/_/g, " "),
            })),
          },
          {
            columnId: "paymentMode",
            title: "Mode",
            options: [
              { value: "offline", label: "offline" },
              { value: "stripe", label: "stripe" },
              { value: "paypal", label: "paypal" },
            ],
          },
          {
            columnId: "paymentStatus",
            title: "Status",
            options: [
              "awaiting_payment",
              "pending_verification",
              "correction_requested",
              "rejected",
              "confirmed",
            ].map((value) => ({
              value,
              label: paymentStatusMeta(value).label,
            })),
          },
        ]}
        bulkActions={({ selectedRows, clearSelection }) => (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void handleBulkDelete(selectedRows, clearSelection)}
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
        title={deleteTarget?.kind === "bulk" ? "Delete registrations?" : "Delete registration?"}
        description={
          deleteTarget === null
            ? ""
            : deleteTarget.kind === "single"
              ? `Permanently delete registration ${deleteTarget.row.referenceNumber || "(pending)"} for ${deleteTarget.row.hubName}? This cannot be undone.`
              : `Permanently delete ${deleteTarget.rows.length} registration(s)? This cannot be undone.`
        }
        confirmLabel={
          deleteTarget?.kind === "bulk" ? `Delete ${deleteTarget.rows.length}` : "Delete"
        }
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </Card>
  );
}

/** Trigger a browser download from a Convex action's base64 payload. */
export function downloadBase64(
  filename: string,
  contentBase64: string,
): void {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type AgcExportKind = "bookings" | "registrations";

/** Shared export-button wiring for the Registrations and Accommodation pages. */
export function AgcExcelExportButton({
  which,
  label,
}: {
  which: AgcExportKind;
  label: string;
}) {
  const { sessionToken } = useAdminSession();
  const exportBookingsAction = useAction(api.agcExcel.exportBookingsExcel);
  const exportRegistrationsAction = useAction(
    api.agcExcel.exportRegistrationsExcel,
  );
  const [exporting, setExporting] = useState(false);

  const runExport = async () => {
    if (!sessionToken) return;
    setExporting(true);
    try {
      const result =
        which === "bookings"
          ? await exportBookingsAction({ sessionToken })
          : await exportRegistrationsAction({ sessionToken });
      downloadBase64(result.filename, result.contentBase64);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={exporting}
      onClick={() => void runExport()}
    >
      {exporting ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <DownloadIcon className="size-4" />
      )}
      {label}
    </Button>
  );
}
