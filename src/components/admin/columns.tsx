"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Doc } from "@convex/_generated/dataModel";
import { PaymentStatusBadge } from "@/components/admin/RecordDetailSheet";

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export const multiSelectFilter = <T,>(
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true;
  const value = String(row.getValue(columnId) ?? "");
  return filterValue.includes(value);
};

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
  {
    accessorKey: "fullName",
    header: "Name",
    cell: ({ row }) => row.original.fullName ?? "—",
  },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "phone", header: "Phone" },
  {
    accessorKey: "type",
    header: "Type",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <span className="capitalize">{row.original.type}</span>
    ),
  },
  {
    accessorKey: "region",
    header: "Region",
    filterFn: multiSelectFilter,
  },
  { accessorKey: "ticketQuantity", header: "Tickets" },
  {
    id: "total",
    accessorFn: (row) => row.totalAmount,
    header: "Total",
    cell: ({ row }) =>
      `${row.original.totalAmount} ${row.original.currency}`,
  },
  {
    accessorKey: "paymentStatus",
    header: "Status",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <PaymentStatusBadge status={row.original.paymentStatus} />
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
];

export function registrationExportRow(r: Doc<"registrations">) {
  return {
    reference: r.referenceNumber ?? "",
    name: r.fullName ?? "",
    email: r.email,
    phone: r.phone,
    type: r.type,
    region: r.region,
    tickets: r.ticketQuantity,
    total: r.totalAmount,
    currency: r.currency,
    status: r.paymentStatus,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}

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
  { accessorKey: "guestEmail", header: "Email" },
  {
    accessorKey: "housingType",
    header: "Type",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <span className="capitalize">{row.original.housingType}</span>
    ),
  },
  { accessorKey: "checkIn", header: "Check-in" },
  { accessorKey: "checkOut", header: "Check-out" },
  { accessorKey: "guests", header: "Guests" },
  {
    id: "total",
    accessorFn: (row) => row.totalAmount,
    header: "Total",
    cell: ({ row }) => `$${row.original.totalAmount}`,
  },
  {
    accessorKey: "paymentStatus",
    header: "Status",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <PaymentStatusBadge status={row.original.paymentStatus} />
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
];

export function bookingExportRow(b: Doc<"housingBookings">) {
  return {
    reference: b.referenceNumber ?? "",
    guest: b.guestName,
    email: b.guestEmail,
    type: b.housingType,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    guests: b.guests,
    total: b.totalAmount,
    status: b.paymentStatus,
    createdAt: new Date(b.createdAt).toISOString(),
  };
}

export const emailLogColumns: ColumnDef<Doc<"emailLogs">>[] = [
  { accessorKey: "to", header: "To" },
  { accessorKey: "subject", header: "Subject" },
  {
    accessorKey: "type",
    header: "Type",
    filterFn: multiSelectFilter,
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <Badge variant="secondary" className="capitalize">
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
];

export function emailExportRow(e: Doc<"emailLogs">) {
  return {
    to: e.to,
    subject: e.subject,
    type: e.type,
    status: e.status,
    createdAt: new Date(e.createdAt).toISOString(),
  };
}

export const teamColumns: ColumnDef<{
  _id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: number;
}>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "role",
    header: "Role",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <Badge variant="outline" className="capitalize">
        {row.original.role}
      </Badge>
    ),
  },
  {
    id: "status",
    accessorFn: (row) => (row.active ? "active" : "inactive"),
    header: "Status",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <Badge variant={row.original.active ? "secondary" : "outline"}>
        {row.original.active ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
];

export const auditLogColumns: ColumnDef<Doc<"auditLogs">>[] = [
  {
    accessorKey: "createdAt",
    header: "When",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "actorEmail",
    header: "Actor",
    cell: ({ row }) => row.original.actorEmail ?? "—",
  },
  {
    accessorKey: "action",
    header: "Action",
    filterFn: multiSelectFilter,
  },
  { accessorKey: "entityType", header: "Entity" },
  { accessorKey: "summary", header: "Summary" },
];

export function createActionsColumn<T>(
  render: (row: T) => React.ReactNode,
): ColumnDef<T> {
  return {
    id: "actions",
    header: "",
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => (
      <div
        className="flex justify-end"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {render(row.original)}
      </div>
    ),
  };
}
