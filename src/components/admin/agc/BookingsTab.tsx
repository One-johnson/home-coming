"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  ReviewActions,
  type ReviewDecision,
} from "@/components/admin/agc/AgcAdminClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatTile } from "@/components/portal/StatTile";
import { createActionsColumn, multiSelectFilter } from "@/components/admin/columns";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import {
  AGC_ACCOMMODATION_LABELS,
  bookingStatusMeta,
  paymentStatusMeta,
} from "@/lib/agcPortal";
import { cn } from "@/lib/utils";

type AdminBookingRow = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  region: string;
  currency: string;
  totalAmount: number;
  paymentMode: string;
  paymentStatus: string;
  bookingStatus: string;
  adminMessage: string | null;
  offline: {
    amountPaid: number;
    referenceNumber: string;
    method: string;
    paymentDate: string;
    receiptFileName?: string;
  } | null;
  receiptUrl: string | null;
  expiresAt: number | null;
  createdAt: number;
  guests: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    gender: string;
    title: string;
    accommodationType: string;
    isBishopRate: boolean;
    status: string;
  }>;
};

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BookingsTab() {
  const { sessionToken } = useAdminSession();
  const bookings = useQuery(
    api.agcAdminData.listAgcBookingsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const review = useMutation(api.agcAdminData.reviewAgcBooking);
  const deleteOne = useMutation(api.agcAdminData.deleteAgcBooking);
  const deleteBulk = useMutation(api.agcAdminData.deleteAgcBookingsBulk);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const list = useMemo(() => bookings ?? [], [bookings]);

  const summary = useMemo(
    () => ({
      total: list.length,
      awaiting: list.filter(
        (b: AdminBookingRow) =>
          b.paymentStatus === "pending_verification" ||
          b.paymentStatus === "correction_requested",
      ).length,
      reserved: list.filter((b: AdminBookingRow) => b.bookingStatus === "reserved").length,
      confirmed: list.filter((b: AdminBookingRow) => b.bookingStatus === "confirmed").length,
    }),
    [list],
  );

  const decide = async (
    row: AdminBookingRow,
    decision: ReviewDecision,
    message?: string,
  ) => {
    if (!sessionToken) return;
    setBusyId(row._id);
    try {
      await review({
        sessionToken,
        bookingId: row._id as Id<"agcBookings">,
        decision,
        message,
      });
      toast.success(`Booking ${decision.replace(/_/g, " ")}d`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Review failed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteOne = async (row: AdminBookingRow) => {
    if (!sessionToken) return;
    if (
      !window.confirm(
        `Permanently delete booking ${row.referenceNumber || "(pending)"} for ${row.hubName}? Its guests, pricing lines, and receipt are removed and any held rooms return to the pool. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(row._id);
    try {
      await deleteOne({
        sessionToken,
        bookingId: row._id as Id<"agcBookings">,
      });
      toast.success("Booking deleted");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Delete failed"));
    } finally {
      setBusyId(null);
    }
  };

  const handleBulkDelete = async (
    selectedRows: AdminBookingRow[],
    clearSelection: () => void,
  ) => {
    if (!sessionToken || selectedRows.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${selectedRows.length} booking(s)? Their guests, pricing lines, and receipts are removed and any held rooms return to the pools. This cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      const result = await deleteBulk({
        sessionToken,
        ids: selectedRows.map((r) => r._id as Id<"agcBookings">),
      });
      toast.success(`Deleted ${result.deleted} booking(s)`);
      clearSelection();
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk delete failed"));
    }
  };

  const columns = useMemo<ColumnDef<AdminBookingRow>[]>(
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
      {
        accessorKey: "bookingStatus",
        header: "Booking",
        filterFn: multiSelectFilter,
        cell: ({ row }) => {
          const status = bookingStatusMeta(row.original.bookingStatus);
          return (
            <Badge variant="outline" className={status.className}>
              {status.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
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
        id: "guests",
        accessorFn: (row) =>
          row.guests.filter((g) => g.status === "active").length,
        header: "Guests",
      },
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
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      createActionsColumn<AdminBookingRow>((row) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busyId === row._id}
          aria-label={`Delete booking ${row.referenceNumber || row.hubName}`}
          onClick={() => void handleDeleteOne(row)}
        >
          <Trash2 className="size-4" />
        </Button>
      )),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over stable session/mutations
    [busyId, sessionToken],
  );

  const renderSubRow = (row: AdminBookingRow) => {
    return (
      <div className="space-y-2">
        <div className="space-y-1 text-xs">
          {row.guests.map((guest) => (
            <p key={guest._id}>
              {guest.title} {guest.firstName} {guest.lastName} · {guest.gender} ·{" "}
              {AGC_ACCOMMODATION_LABELS[
                guest.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
              ] ?? guest.accommodationType}
              {guest.isBishopRate ? " · Bishop rate" : ""}
              {guest.status !== "active" ? ` · ${guest.status}` : ""}
            </p>
          ))}
          {row.guests.length === 0 && (
            <p className="text-muted-foreground">No guests recorded.</p>
          )}
        </div>
        {row.offline && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p>
              Amount paid:{" "}
              <strong>
                {row.currency} {row.offline.amountPaid}
              </strong>{" "}
              · {row.offline.method.replace(/_/g, " ")} ·{" "}
              {row.offline.paymentDate} · ref {row.offline.referenceNumber}
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
        {row.expiresAt && row.bookingStatus === "reserved" && (
          <p className="text-xs text-muted-foreground">
            Hold expires {new Date(row.expiresAt).toLocaleString()}
          </p>
        )}
        {row.paymentStatus === "pending_verification" && (
          <ReviewActions
            disabled={busyId === row._id}
            onDecision={(decision, message) => void decide(row, decision, message)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total bookings" value={summary.total} />
        <StatTile
          label="Awaiting review"
          value={summary.awaiting}
          tone={summary.awaiting > 0 ? "warning" : "positive"}
          hint="receipts to approve or correct"
        />
        <StatTile label="On hold (reserved)" value={summary.reserved} tone="info" />
        <StatTile label="Confirmed" value={summary.confirmed} tone="positive" />
      </div>

      <Card className={cn("p-4")}>
        <DataTable
          columns={columns}
          data={list}
          isLoading={bookings === undefined}
          emptyMessage="No bookings yet."
          searchPlaceholder="Search reference, hub, guest…"
          getRowId={(row) => row._id}
          onRowClick={(row) =>
            setExpandedId((prev) => (prev === row._id ? null : row._id))
          }
          renderSubRow={renderSubRow}
          expandedId={expandedId}
          exportFilename="agc-bookings.csv"
          exportRow={(row) => ({
            reference: row.referenceNumber,
            hub: row.hubName,
            region: row.region,
            bookingStatus: row.bookingStatus,
            paymentStatus: row.paymentStatus,
            guests: row.guests.filter((g) => g.status === "active").length,
            total: row.totalAmount,
            currency: row.currency,
            mode: row.paymentMode,
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
              ].map((value) => ({ value, label: value.replace(/_/g, " ") })),
            },
            {
              columnId: "bookingStatus",
              title: "Booking",
              options: [
                "reserved",
                "pending_verification",
                "correction_requested",
                "confirmed",
                "expired",
                "cancelled",
              ].map((value) => ({
                value,
                label: bookingStatusMeta(value).label,
              })),
            },
            {
              columnId: "paymentStatus",
              title: "Payment",
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
      </Card>
    </div>
  );
}
