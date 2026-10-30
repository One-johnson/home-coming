"use client";

import { Suspense, useEffect, useMemo, useState, startTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  tourOrderColumns,
  tourOrderExportRow,
  type TourOrderRow,
} from "@/components/admin/columns";
import { TourPackageManager } from "@/components/admin/TourPackageManager";
import {
  PaymentStatusButtons,
  RecordDetailSheet,
  type PaymentStatus,
} from "@/components/admin/RecordDetailSheet";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

function TourOrdersTable() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const searchParams = useSearchParams();
  const allowed = canAccessArea(user?.role, "registration");
  const orders = useQuery(api.tourOrders.list, allowed ? sessionArgs : "skip");
  const updateStatus = useMutation(api.tourOrders.updatePaymentStatus);
  const bulkUpdate = useMutation(api.tourOrders.bulkUpdatePaymentStatus);
  const removeOrder = useMutation(api.tourOrders.remove);

  const [selected, setSelected] = useState<TourOrderRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TourOrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Deleting a money record is a super-admin action; everyone who can see the
  // orders can still change their payment status.
  const canDelete = user?.role === "admin";

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !orders) return;
    const match = orders.find((o) => o._id === id);
    if (match) startTransition(() => setSelected(match));
  }, [searchParams, orders]);

  const regions = useMemo(() => {
    const set = new Set((orders ?? []).map((o) => o.region));
    return [...set].sort().map((value) => ({ label: value, value }));
  }, [orders]);

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to tour orders.
      </p>
    );
  }

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      await removeOrder({ sessionToken, id: deleteTarget._id });
      toast.success(
        `Deleted ${deleteTarget.referenceNumber ?? "tour order"}`,
      );
      if (selected?._id === deleteTarget._id) setSelected(null);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Could not delete that order");
    } finally {
      setDeleting(false);
    }
  };

  const setPayment = async (
    id: Id<"tourOrders">,
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
      toast.error(cleanErrorMessage(err) || "Failed to update status");
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      <DataTable
        columns={tourOrderColumns}
        data={orders ?? []}
        isLoading={orders === undefined}
        emptyMessage="No tour orders yet."
        searchPlaceholder="Search tour orders..."
        exportFilename="tour-orders.csv"
        exportRow={tourOrderExportRow}
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
                      toast.error(cleanErrorMessage(err) || "Bulk update failed");
                    }
                  }}
                >
                  Mark {status.replaceAll("_", " ")}
                </Button>
              ),
            )}
          </>
        )}
      />

      <RecordDetailSheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.fullName ?? "Tour order"}
        description={selected?.referenceNumber ?? undefined}
        fields={
          selected
            ? [
                { label: "Email", value: selected.email },
                {
                  label: "Phone",
                  value: `${selected.countryCode} ${selected.phone}`,
                },
                { label: "Region", value: selected.region },
                { label: "Group", value: selected.groupName ?? "—" },
                {
                  label: "Denomination",
                  value: selected.denomination ?? "—",
                },
                {
                  label: "Affiliation",
                  value: selected.church ?? "—",
                },
                {
                  label: "Packages",
                  value: selected.items
                    .map(
                      (item) =>
                        `${item.label} × ${item.quantity} ($${item.unitPrice})`,
                    )
                    .join("; "),
                },
                {
                  label: "Total",
                  value: `$${selected.totalAmount} ${selected.currency}`,
                },
                { label: "Gateway", value: selected.gateway },
                {
                  label: "Status",
                  value: selected.paymentStatus.replaceAll("_", " "),
                },
                {
                  label: "Payment receipt",
                  value: selected.receiptUrl ? (
                    <a
                      href={selected.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-primary hover:underline"
                    >
                      View uploaded receipt
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      Not uploaded yet
                    </span>
                  ),
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
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <PaymentStatusButtons
                current={selected.paymentStatus}
                onChange={(status) => void setPayment(selected._id, status)}
              />
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setDeleteTarget(selected)}
                >
                  Delete order
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete tour order?"
        description={
          deleteTarget
            ? `${deleteTarget.referenceNumber ?? "This order"} for ${
                deleteTarget.fullName
              } will be permanently deleted, along with any uploaded receipt. Its audit entry is kept. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete order"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function AdminToursInner() {
  const searchParams = useSearchParams();
  const defaultTab =
    searchParams.get("tab") === "orders" ? "orders" : "packages";

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList>
        <TabsTrigger value="packages">Packages</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
      </TabsList>
      <TabsContent value="packages" className="mt-4">
        <TourPackageManager />
      </TabsContent>
      <TabsContent value="orders" className="mt-4">
        <TourOrdersTable />
      </TabsContent>
    </Tabs>
  );
}

export default function AdminToursPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <AdminToursInner />
    </Suspense>
  );
}
