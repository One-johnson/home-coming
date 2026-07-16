"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Doc } from "@convex/_generated/dataModel";
import { PaymentStatusBadge } from "@/components/admin/RecordDetailSheet";
import {
  emailStatusBadgeClass,
  mediaTypeBadgeClass,
} from "@/lib/adminColors";
import { cn } from "@/lib/utils";

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
    phone: `${r.countryCode} ${r.phone}`,
    type: r.type,
    region: r.region,
    group: r.group ?? "",
    denomination: r.denomination ?? "",
    church: r.church ?? "",
    tickets: r.ticketQuantity,
    addOns: r.addOns
      .map((item) =>
        typeof item === "string" ? item : `${item.id} x${item.quantity}`,
      )
      .join("; "),
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

export const tourOrderColumns: ColumnDef<Doc<"tourOrders">>[] = [
  {
    accessorKey: "referenceNumber",
    header: "Reference",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.referenceNumber ?? "—"}
      </span>
    ),
  },
  { accessorKey: "fullName", header: "Name" },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "region",
    header: "Region",
    filterFn: multiSelectFilter,
  },
  {
    id: "items",
    accessorFn: (row) =>
      row.items.map((item) => `${item.label}×${item.quantity}`).join(", "),
    header: "Packages",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.items
          .map((item) => `${item.label} × ${item.quantity}`)
          .join("; ")}
      </span>
    ),
  },
  {
    id: "total",
    accessorFn: (row) => row.totalAmount,
    header: "Total",
    cell: ({ row }) => `$${row.original.totalAmount}`,
  },
  {
    accessorKey: "gateway",
    header: "Gateway",
    cell: ({ row }) => (
      <span className="capitalize">{row.original.gateway}</span>
    ),
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

export function tourOrderExportRow(o: Doc<"tourOrders">) {
  return {
    reference: o.referenceNumber ?? "",
    name: o.fullName,
    email: o.email,
    phone: `${o.countryCode} ${o.phone}`,
    region: o.region,
    group: o.groupName ?? "",
    items: o.items
      .map((item) => `${item.label} x${item.quantity}@${item.unitPrice}`)
      .join("; "),
    total: o.totalAmount,
    currency: o.currency,
    gateway: o.gateway,
    status: o.paymentStatus,
    createdAt: new Date(o.createdAt).toISOString(),
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
      <Badge
        variant="outline"
        className={cn("capitalize", emailStatusBadgeClass(row.original.status))}
      >
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
      <Badge
        variant="outline"
        className="capitalize border-gold/30 bg-gold/10 text-gold-dark"
      >
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
      <Badge
        variant="outline"
        className={cn(
          row.original.active
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-stone-200 bg-stone-50 text-stone-600",
        )}
      >
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

export const messageColumns: ColumnDef<Doc<"messages">>[] = [
  {
    accessorKey: "year",
    header: "Year",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="border-gold/30 bg-gold/10 text-gold-dark"
      >
        {row.original.year}
      </Badge>
    ),
  },
  {
    accessorKey: "order",
    header: "Order",
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-[28rem] font-medium">
        {row.original.title}
      </span>
    ),
  },
  {
    accessorKey: "speaker",
    header: "Speaker",
  },
  {
    accessorKey: "mediaType",
    header: "Type",
    filterFn: multiSelectFilter,
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn(
          "capitalize",
          mediaTypeBadgeClass(row.original.mediaType),
        )}
      >
        {row.original.mediaType}
      </Badge>
    ),
  },
  {
    accessorKey: "url",
    header: "URL",
    cell: ({ row }) => (
      <a
        href={row.original.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-[16rem] truncate text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.url}
      </a>
    ),
  },
];

export function messageExportRow(m: Doc<"messages">) {
  return {
    year: m.year,
    order: m.order,
    title: m.title,
    speaker: m.speaker,
    mediaType: m.mediaType,
    url: m.url,
  };
}

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
