"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { bookingColumns, bookingExportRow } from "@/components/admin/columns";
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

function BookingsTable() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const searchParams = useSearchParams();
  const allowed = canAccessArea(user?.role, "accommodation");
  const bookings = useQuery(
    api.housing.listBookings,
    allowed ? sessionArgs : "skip",
  );
  const updateStatus = useMutation(api.housing.updateBookingPaymentStatus);
  const bulkUpdate = useMutation(api.housing.bulkUpdateBookingPaymentStatus);
  const [selected, setSelected] = useState<Doc<"housingBookings"> | null>(
    null,
  );

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || !bookings) return;
    const match = bookings.find((b) => b._id === id);
    if (match) setSelected(match);
  }, [searchParams, bookings]);

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to bookings.
      </p>
    );
  }

  const setPayment = async (
    id: Id<"housingBookings">,
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

  return (
    <div className="w-full min-w-0 space-y-4">
      <DataTable
        columns={bookingColumns}
        data={bookings ?? []}
        isLoading={bookings === undefined}
        emptyMessage="No bookings yet."
        searchPlaceholder="Search bookings..."
        exportFilename="housing-bookings.csv"
        exportRow={bookingExportRow}
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
            columnId: "housingType",
            title: "Type",
            options: [
              { label: "Condo", value: "condo" },
              { label: "Hostel", value: "hostel" },
              { label: "Apartment", value: "apartment" },
            ],
          },
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
          </>
        )}
      />

      <RecordDetailSheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.guestName ?? "Booking"}
        description={selected?.referenceNumber ?? undefined}
        fields={
          selected
            ? [
                { label: "Email", value: selected.guestEmail },
                { label: "Phone", value: selected.guestPhone },
                { label: "Type", value: selected.housingType },
                { label: "Check-in", value: selected.checkIn },
                { label: "Check-out", value: selected.checkOut },
                { label: "Guests", value: selected.guests },
                { label: "Total", value: `$${selected.totalAmount}` },
                {
                  label: "Status",
                  value: selected.paymentStatus.replaceAll("_", " "),
                },
                { label: "Notes", value: selected.notes ?? "—" },
                {
                  label: "Created",
                  value: new Date(selected.createdAt).toLocaleString(),
                },
              ]
            : []
        }
        footer={
          selected ? (
            <PaymentStatusButtons
              current={selected.paymentStatus}
              onChange={(status) => void setPayment(selected._id, status)}
            />
          ) : null
        }
      />
    </div>
  );
}

export default function AdminBookingsPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
    >
      <BookingsTable />
    </Suspense>
  );
}
