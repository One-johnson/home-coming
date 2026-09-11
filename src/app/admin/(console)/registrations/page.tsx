"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  registrationColumns,
  registrationExportRow,
} from "@/components/admin/columns";
import {
  PaymentStatusButtons,
  RecordDetailSheet,
  type PaymentStatus,
} from "@/components/admin/RecordDetailSheet";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

function RegistrationsTable() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const searchParams = useSearchParams();
  const allowed = canAccessArea(user?.role, "registration");
  const registrations = useQuery(
    api.registrations.list,
    allowed ? sessionArgs : "skip",
  );
  const updateStatus = useMutation(api.registrations.updatePaymentStatus);
  const bulkUpdate = useMutation(api.registrations.bulkUpdatePaymentStatus);
  const removeRegistration = useMutation(api.registrations.remove);
  const bulkRemove = useMutation(api.registrations.bulkRemove);

  const [selected, setSelected] = useState<Doc<"registrations"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "single"; id: Id<"registrations">; label: string }
    | {
        type: "bulk";
        ids: Id<"registrations">[];
        clearSelection: () => void;
      }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !registrations) return;
    const match = registrations.find((r) => r._id === id);
    if (match) setSelected(match);
  }, [searchParams, registrations]);

  const regions = useMemo(() => {
    const set = new Set((registrations ?? []).map((r) => r.region));
    return [...set].sort().map((value) => ({ label: value, value }));
  }, [registrations]);

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to registrations.
      </p>
    );
  }

  const setPayment = async (
    id: Id<"registrations">,
    paymentStatus: PaymentStatus,
  ) => {
    if (!sessionToken) return;
    try {
      await updateStatus({ sessionToken, id, paymentStatus });
      toast.success(`Marked as ${paymentStatus.replaceAll("_", " ")}`);
      if (selected?._id === id) {
        setSelected((prev) => (prev ? { ...prev, paymentStatus } : prev));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "single") {
        await removeRegistration({
          sessionToken,
          id: deleteTarget.id,
        });
        toast.success("Registration deleted");
        if (selected?._id === deleteTarget.id) {
          setSelected(null);
        }
      } else {
        const result = await bulkRemove({
          sessionToken,
          ids: deleteTarget.ids,
        });
        toast.success(
          `Deleted ${result.deleted} registration${result.deleted === 1 ? "" : "s"}`,
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
        columns={registrationColumns}
        data={registrations ?? []}
        isLoading={registrations === undefined}
        emptyMessage="No registrations yet."
        searchPlaceholder="Search registrations..."
        exportFilename="registrations.csv"
        exportRow={registrationExportRow}
        getRowId={(row) => row._id}
        onRowClick={setSelected}
        facetFilters={[
          {
            columnId: "paymentStatus",
            title: "Status",
            options: [
              { label: "Pending", value: "pending_payment" },
              { label: "Paid", value: "paid" },
              { label: "Failed", value: "failed" },
              { label: "Mock paid", value: "mock_paid" },
            ],
          },
          {
            columnId: "type",
            title: "Type",
            options: [
              { label: "Individual", value: "individual" },
              { label: "Group", value: "group" },
            ],
          },
          { columnId: "region", title: "Region", options: regions },
        ]}
        bulkActions={({ selectedRows, clearSelection }) => (
          <>
            {(["paid", "pending_payment", "failed"] as PaymentStatus[]).map(
              (status) => (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  className="capitalize"
                  onClick={async () => {
                    if (!sessionToken) return;
                    try {
                      const result = await bulkUpdate({
                        sessionToken,
                        ids: selectedRows.map((r) => r._id),
                        paymentStatus: status,
                      });
                      toast.success(
                        `Updated ${result.updated} to ${status.replaceAll("_", " ")}`,
                      );
                      clearSelection();
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Bulk update failed",
                      );
                    }
                  }}
                >
                  Mark {status.replaceAll("_", " ")}
                </Button>
              ),
            )}
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
          </>
        )}
      />

      <RecordDetailSheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.fullName ?? selected?.email ?? "Registration"}
        description={selected?.referenceNumber ?? undefined}
        fields={
          selected
            ? [
                { label: "Email", value: selected.email },
                {
                  label: "Phone",
                  value: `${selected.countryCode} ${selected.phone}`,
                },
                { label: "Type", value: selected.type },
                { label: "Region", value: selected.region },
                { label: "Group", value: selected.group ?? "—" },
                { label: "Denomination", value: selected.denomination ?? "—" },
                { label: "Church / Ministry", value: selected.church ?? "—" },
                { label: "Tickets", value: selected.ticketQuantity },
                {
                  label: "Add-ons",
                  value:
                    selected.addOns.length === 0
                      ? "—"
                      : selected.addOns
                          .map((item) =>
                            typeof item === "string"
                              ? item
                              : `${item.id} × ${item.quantity}`,
                          )
                          .join(", "),
                },
                {
                  label: "Total",
                  value: `${selected.totalAmount} ${selected.currency}`,
                },
                { label: "Gateway", value: selected.gateway },
                {
                  label: "Status",
                  value: selected.paymentStatus.replaceAll("_", " "),
                },
                {
                  label: "Created",
                  value: new Date(selected.createdAt).toLocaleString(),
                },
              ]
            : []
        }
        footer={
          selected ? (
            <>
              <PaymentStatusButtons
                current={selected.paymentStatus}
                onChange={(status) => void setPayment(selected._id, status)}
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  setDeleteTarget({
                    type: "single",
                    id: selected._id,
                    label:
                      selected.referenceNumber ??
                      selected.fullName ??
                      selected.email,
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
            ? `Delete ${deleteTarget.ids.length} registration${deleteTarget.ids.length === 1 ? "" : "s"}?`
            : "Delete registration?"
        }
        description={
          deleteTarget?.type === "bulk"
            ? "Selected registrations will be permanently removed. This cannot be undone."
            : `“${deleteTarget?.label ?? "This registration"}” will be permanently removed. This cannot be undone.`
        }
        confirmLabel={
          deleteTarget?.type === "bulk"
            ? `Delete ${deleteTarget.ids.length}`
            : "Delete registration"
        }
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export default function AdminRegistrationsPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <RegistrationsTable />
    </Suspense>
  );
}
