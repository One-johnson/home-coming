"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { ColumnDef } from "@tanstack/react-table";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatTile } from "@/components/portal/StatTile";
import { multiSelectFilter } from "@/components/admin/columns";
import {
  bookingStatusMeta,
  formatMoneyByCurrency,
  paymentStatusMeta,
} from "@/lib/agcPortal";

/**
 * Read-only accommodations table for the finance role — the same booking rows
 * the accommodation console sees, stripped of every write action. Finance
 * reviews the money (amounts, payment status, receipts); approvals and
 * deletions stay with admin/accommodation.
 */

type FinanceBookingRow = {
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

export default function FinanceAccommodationsTable() {
  const { sessionToken } = useAdminSession();
  const bookings = useQuery(
    api.agcAdminData.listAgcBookingsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );

  const list = useMemo(() => bookings ?? [], [bookings]);

  const summary = useMemo(() => {
    // Money is summed per currency only — cedis and dollars are never mixed.
    const revenue: Record<string, number> = {};
    let confirmed = 0;
    let awaiting = 0;
    let reserved = 0;
    for (const booking of list) {
      if (booking.paymentStatus === "confirmed") {
        revenue[booking.currency] =
          (revenue[booking.currency] ?? 0) + booking.totalAmount;
        confirmed += 1;
      } else if (
        booking.paymentStatus === "pending_verification" ||
        booking.paymentStatus === "correction_requested" ||
        booking.bookingStatus === "reserved"
      ) {
        awaiting += 1;
      }
      if (booking.bookingStatus === "reserved") reserved += 1;
    }
    return { total: list.length, confirmed, awaiting, reserved, revenue };
  }, [list]);

  const columns = useMemo<ColumnDef<FinanceBookingRow>[]>(
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
          row.guests.filter((guest) => guest.status === "active").length,
        header: "Guests",
      },
      {
        id: "total",
        accessorFn: (row) => row.totalAmount,
        header: "Total",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.currency}{" "}
            {row.original.totalAmount.toLocaleString("en-US")}
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
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total bookings" value={summary.total} />
        <StatTile label="Confirmed" value={summary.confirmed} tone="positive" />
        <StatTile
          label="Awaiting review"
          value={summary.awaiting}
          tone={summary.awaiting > 0 ? "warning" : "neutral"}
          hint="payments to be verified"
        />
        <StatTile
          label="Confirmed revenue"
          value={formatMoneyByCurrency(summary.revenue)}
          tone="positive"
          hint="per currency, never mixed"
        />
      </div>

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={list}
          isLoading={bookings === undefined}
          emptyMessage="No bookings yet."
          searchPlaceholder="Search reference, hub, guest…"
          getRowId={(row) => row._id}
          exportFilename="finance-accommodations.csv"
          exportRow={(row) => ({
            reference: row.referenceNumber,
            hub: row.hubName,
            region: row.region,
            bookingStatus: row.bookingStatus,
            paymentStatus: row.paymentStatus,
            guests: row.guests.filter((guest) => guest.status === "active")
              .length,
            total: row.totalAmount,
            currency: row.currency,
            createdAt: new Date(row.createdAt).toISOString(),
          })}
          facetFilters={[
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
        />
      </Card>
    </div>
  );
}
