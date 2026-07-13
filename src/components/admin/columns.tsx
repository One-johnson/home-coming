"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Doc } from "@convex/_generated/dataModel";

export const registrationColumns: ColumnDef<Doc<"registrations">>[] = [
  {
    accessorKey: "referenceNumber",
    header: "Reference",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.referenceNumber ?? "—"}
      </span>
    ),
  },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => (
      <span className="capitalize">{row.original.type}</span>
    ),
  },
  { accessorKey: "region", header: "Region" },
  { accessorKey: "ticketQuantity", header: "Tickets" },
  {
    id: "total",
    header: "Total",
    cell: ({ row }) =>
      `${row.original.totalAmount} ${row.original.currency}`,
  },
  {
    accessorKey: "paymentStatus",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.paymentStatus}</Badge>
    ),
  },
];

export const bookingColumns: ColumnDef<Doc<"housingBookings">>[] = [
  {
    accessorKey: "referenceNumber",
    header: "Reference",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.referenceNumber ?? "—"}
      </span>
    ),
  },
  { accessorKey: "guestName", header: "Guest" },
  {
    accessorKey: "housingType",
    header: "Type",
    cell: ({ row }) => (
      <span className="capitalize">{row.original.housingType}</span>
    ),
  },
  { accessorKey: "checkIn", header: "Check-in" },
  { accessorKey: "checkOut", header: "Check-out" },
  {
    id: "total",
    header: "Total",
    cell: ({ row }) => `$${row.original.totalAmount}`,
  },
  {
    accessorKey: "paymentStatus",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.paymentStatus}</Badge>
    ),
  },
];

export const emailLogColumns: ColumnDef<Doc<"emailLogs">>[] = [
  { accessorKey: "to", header: "To" },
  { accessorKey: "subject", header: "Subject" },
  { accessorKey: "type", header: "Type" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.status}</Badge>
    ),
  },
];
