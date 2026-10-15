"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ColumnDef } from "@tanstack/react-table";
import {
  BadgeCheckIcon,
  BedDouble,
  HandCoins,
  LinkIcon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { AgcExcelExportButton } from "@/components/admin/agc/AgcAdminClient";
import {
  RowDetailDialog,
  RowDetailItem,
  RowDetailList,
  RowDetailSection,
} from "@/components/admin/agc/RowDetailDialog";
import { multiSelectFilter } from "@/components/admin/columns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { cn } from "@/lib/utils";
import { poaStatusMeta } from "@/lib/agcPoa";

/**
 * Payment-on-arrival status table for admin + finance: one row per POA
 * registration or accommodation booking, with the accommodation types the
 * record holds, the evidence link, and the "confirm payment" action that
 * credits the total and converts the IOU receipt into a paid receipt.
 *
 * Clicking a row opens the full record (accommodation types, guest roster,
 * evidence, notes and timeline). Payments can be confirmed one at a time or in
 * bulk — both paths ask for confirmation first, because confirming credits
 * money and locks beds in.
 *
 * The table is the shared DataTable: search, per-column filters (kind, POA and
 * payment status, hold, region), sortable columns, the Columns dropdown,
 * pagination and a CSV export. Only rows whose IOU is still live can be
 * ticked, so a bulk confirm can never touch a payment that is already
 * confirmed or a hold whose beds are gone.
 *
 * `kind` scopes the table: the registrations page shows registrations, the
 * accommodation page shows bookings, and "all" (default) shows both.
 */

type PoaRow = {
  kind: "registration" | "booking";
  _id: string;
  referenceNumber: string;
  hubName: string;
  region: string;
  currency: string;
  totalAmount: number;
  units: number;
  paymentStatus: string;
  bookingStatus: string | null;
  poaStatus: string;
  evidenceUrl: string | null;
  evidenceFileName: string | null;
  note: string | null;
  createdAt: number;
  submittedAt: number | null;
  confirmedAt: number | null;
  confirmedBy: string | null;
  expiresAt: number | null;
  released: boolean;
  accommodation: Array<{ type: string; label: string; units: number }>;
  guests: Array<{ name: string; type: string; gender: string }>;
};

function formatWhen(ts: number | null) {
  return ts ? new Date(ts).toLocaleString() : "—";
}

/** Per-currency totals, GHS first — cedis and dollars are never summed. */
function totalsByCurrency(rows: PoaRow[]): Array<[string, number]> {
  const byCurrency: Record<string, number> = {};
  for (const row of rows) {
    byCurrency[row.currency] = (byCurrency[row.currency] ?? 0) + row.totalAmount;
  }
  return Object.entries(byCurrency).sort(([a], [b]) =>
    a === b ? 0 : a === "GHS" ? -1 : b === "GHS" ? 1 : a.localeCompare(b),
  );
}

/** A row is confirmable while its IOU is live and its beds are still held. */
function isConfirmable(row: PoaRow): boolean {
  return row.poaStatus !== "confirmed" && !row.released;
}

export function PoaTab({ kind = "all" }: { kind?: "all" | "registration" | "booking" }) {
  const { sessionToken, user } = useAdminSession();
  const allRows = useQuery(
    api.agcPoa.listPoaRecordsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const confirmPoa = useMutation(api.agcPoa.confirmPoaPayment);
  const confirmPoaBulk = useMutation(api.agcPoa.confirmPoaPaymentsBulk);
  const rows = useMemo(
    () => (kind === "all" ? allRows : allRows?.filter((row) => row.kind === kind)),
    [allRows, kind],
  );

  const list = useMemo(() => rows ?? [], [rows]);

  const [detailsRow, setDetailsRow] = useState<PoaRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<PoaRow | null>(null);
  /**
   * The rows behind an in-flight bulk confirm, with the selection's own reset
   * — the table owns selection state, so the dialog snapshots what it will
   * credit and clears it only after the mutation succeeds.
   */
  const [bulkTarget, setBulkTarget] = useState<{
    rows: PoaRow[];
    clear: () => void;
  } | null>(null);
  const [confirmNote, setConfirmNote] = useState("");
  const [busy, setBusy] = useState(false);

  const canAct = user?.role === "admin" || user?.role === "finance";

  const columns = useMemo<ColumnDef<PoaRow>[]>(
    () => [
      {
        accessorKey: "kind",
        header: "Kind",
        filterFn: multiSelectFilter,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] capitalize">
            {row.original.kind === "registration" ? "Registration" : "Booking"}
          </Badge>
        ),
      },
      {
        accessorKey: "referenceNumber",
        header: "Reference",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.referenceNumber || "(pending)"}
          </span>
        ),
      },
      {
        accessorKey: "hubName",
        header: "Hub",
        cell: ({ row }) => (
          <span className="block max-w-40 truncate text-sm">
            {row.original.hubName}
          </span>
        ),
      },
      {
        accessorKey: "region",
        header: "Region",
        filterFn: multiSelectFilter,
        cell: ({ row }) => (
          <span className="text-xs capitalize">
            {row.original.region.replace(/_/g, " ")}
          </span>
        ),
      },
      {
        id: "accommodation",
        accessorFn: (row) =>
          row.accommodation.map((entry) => entry.label).join(", "),
        header: "Accommodation",
        cell: ({ row }) =>
          row.original.accommodation.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              n/a (delegates)
            </span>
          ) : (
            <div className="space-y-0.5">
              {row.original.accommodation.map((entry) => (
                <p
                  key={entry.type}
                  className="truncate text-xs"
                  title={entry.label}
                >
                  {entry.label}
                  <span className="text-muted-foreground">
                    {" "}
                    · {entry.units} bed(s)
                  </span>
                </p>
              ))}
            </div>
          ),
      },
      {
        id: "guests",
        accessorFn: (row) => row.guests.map((guest) => guest.name).join(", "),
        header: "Guests",
        cell: ({ row }) =>
          row.original.guests.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span
              className="block max-w-56 truncate text-xs"
              title={row.original.guests
                .map(
                  (guest) => `${guest.name} · ${guest.type} · ${guest.gender}`,
                )
                .join("\n")}
            >
              {row.original.guests.map((guest) => guest.name).join(", ")}
            </span>
          ),
      },
      {
        accessorKey: "units",
        header: "Units",
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.units}
          </span>
        ),
      },
      {
        id: "total",
        accessorFn: (row) => row.totalAmount,
        header: "Total",
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.currency} {row.original.totalAmount.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "poaStatus",
        header: "POA status",
        filterFn: multiSelectFilter,
        cell: ({ row }) => {
          const meta = poaStatusMeta(row.original.poaStatus);
          return (
            <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
              {meta.label}
            </Badge>
          );
        },
      },
      {
        id: "hold",
        accessorFn: (row) => (row.released ? "released" : "held"),
        header: "Hold",
        filterFn: multiSelectFilter,
        cell: ({ row }) =>
          row.original.released ? (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              title="This booking was closed — its beds are back in their pools."
            >
              <Undo2Icon className="size-3" /> Released
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.original.kind === "booking" ? "Held for the desk" : "—"}
            </span>
          ),
      },
      {
        accessorKey: "paymentStatus",
        header: "Payment",
        filterFn: multiSelectFilter,
        cell: ({ row }) => (
          <span className="text-xs capitalize">
            {row.original.paymentStatus.replace(/_/g, " ")}
          </span>
        ),
      },
      {
        id: "bookingStatus",
        accessorFn: (row) => row.bookingStatus ?? "",
        header: "Booking",
        filterFn: multiSelectFilter,
        cell: ({ row }) => (
          <span className="text-xs capitalize">
            {row.original.bookingStatus?.replace(/_/g, " ") ?? "—"}
          </span>
        ),
      },
      {
        id: "evidence",
        accessorFn: (row) => row.evidenceFileName ?? "",
        header: "Evidence",
        cell: ({ row }) =>
          row.original.evidenceUrl ? (
            <a
              href={row.original.evidenceUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <LinkIcon className="size-3" />
              {row.original.evidenceFileName ?? "view"}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatWhen(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.poaStatus === "confirmed" ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                <BadgeCheckIcon className="size-3.5" />
                {formatWhen(row.original.confirmedAt)}
              </span>
            ) : row.original.released ? (
              <span className="text-xs text-muted-foreground">
                beds released
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmNote("");
                  setConfirmTarget(row.original);
                }}
              >
                <HandCoins className="size-4" /> Confirm payment
              </Button>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const counts = useMemo(() => {
    const outstanding = list.filter((row) => row.poaStatus !== "confirmed");
    const released = outstanding.filter((row) => row.released);
    const collectible = outstanding.filter((row) => !row.released);
    return {
      total: list.length,
      pending: list.filter((row) => row.poaStatus === "pending").length,
      evidence: list.filter((row) => row.poaStatus === "evidence_submitted")
        .length,
      confirmed: list.filter((row) => row.poaStatus === "confirmed").length,
      outstanding: outstanding.length,
      released: released.length,
      outstandingLabel:
        totalsByCurrency(collectible)
          .map(([currency, value]) => `${currency} ${value.toLocaleString()}`)
          .join(" · ") || "0",
    };
  }, [list]);

  /** The rows a bulk confirm would credit (empty while its dialog is closed). */
  const bulkRows = bulkTarget?.rows ?? [];

  const openConfirm = (row: PoaRow) => {
    setConfirmNote("");
    setConfirmTarget(row);
  };

  const handleConfirm = async () => {
    if (!sessionToken || !confirmTarget) return;
    setBusy(true);
    try {
      await confirmPoa({
        sessionToken,
        kind: confirmTarget.kind,
        recordId: confirmTarget._id,
        note: confirmNote.trim() || undefined,
      });
      toast.success(
        `Payment confirmed for ${confirmTarget.referenceNumber || "record"} — the IOU receipt is now a paid receipt.`,
      );
      setConfirmTarget(null);
      setConfirmNote("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to confirm payment"));
    } finally {
      setBusy(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (!sessionToken || !bulkTarget || bulkTarget.rows.length === 0) return;
    setBusy(true);
    try {
      const result = await confirmPoaBulk({
        sessionToken,
        records: bulkTarget.rows.map((row) => ({
          kind: row.kind,
          recordId: row._id,
        })),
        note: confirmNote.trim() || undefined,
      });
      if (result.confirmedCount > 0) {
        toast.success(
          `${result.confirmedCount} payment${result.confirmedCount === 1 ? "" : "s"} confirmed — IOUs are now paid receipts.`,
        );
      }
      if (result.failedCount > 0) {
        const reasons = [...new Set(result.failed.map((entry) => entry.reason))];
        toast.error(
          `${result.failedCount} record${result.failedCount === 1 ? "" : "s"} could not be confirmed.`,
          { description: reasons.slice(0, 3).join("; ") },
        );
      }
      bulkTarget.clear();
      setBulkTarget(null);
      setConfirmNote("");
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Failed to confirm the selected payments"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!canAct) {
    return (
      <p className="text-sm text-muted-foreground">
        The payment-on-arrival table is available to admins and finance.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {user?.role === "admin" && (
        <div className="flex flex-wrap justify-end gap-2">
          {kind !== "registration" && (
            <AgcExcelExportButton
              which="poa-bookings"
              label="Accommodation bookings (.xlsx)"
            />
          )}
          <AgcExcelExportButton
            which="poa-collections"
            label="Cash-collection sheet (.xlsx)"
          />
          <AgcExcelExportButton
            which="poa-reconciliation"
            label="End-of-day reconciliation (.xlsx)"
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="POA records" value={counts.total} />
        <Stat label="IOU pending" value={counts.pending} tone="warning" />
        <Stat
          label="Evidence submitted"
          value={counts.evidence}
          hint="receipts waiting on the desk"
        />
        <Stat label="Confirmed" value={counts.confirmed} tone="positive" />
        <Stat
          label="Awaiting payment"
          value={counts.outstanding}
          tone="warning"
          hint={
            counts.released > 0
              ? `${counts.released} hold(s) released — beds back in the pool`
              : "IOUs still uncollected"
          }
        />
        <Stat
          label="Outstanding total"
          value={counts.outstandingLabel}
          hint="not credited until confirmed — per currency"
          tone="info"
        />
      </div>

      <DataTable
        columns={columns}
        data={list}
        isLoading={rows === undefined}
        emptyMessage="No payment-on-arrival records match these filters."
        searchPlaceholder="Search reference, hub, guest, or type…"
        getRowId={(row) => row._id}
        onRowClick={setDetailsRow}
        exportFilename="agc-poa-records.csv"
        exportRow={(row) => ({
          kind: row.kind,
          reference: row.referenceNumber,
          hub: row.hubName,
          region: row.region,
          accommodation: row.accommodation
            .map((entry) => `${entry.label} x${entry.units}`)
            .join("; "),
          guests: row.guests.map((guest) => guest.name).join("; "),
          units: row.units,
          total: row.totalAmount,
          currency: row.currency,
          poaStatus: row.poaStatus,
          hold: row.released ? "released" : "held",
          paymentStatus: row.paymentStatus,
          bookingStatus: row.bookingStatus ?? "",
          evidence: row.evidenceFileName ?? "",
          createdAt: new Date(row.createdAt).toISOString(),
          confirmedAt: row.confirmedAt
            ? new Date(row.confirmedAt).toISOString()
            : "",
        })}
        columnLabels={{
          kind: "Kind",
          referenceNumber: "Reference",
          hubName: "Hub",
          region: "Region",
          accommodation: "Accommodation",
          guests: "Guests",
          units: "Units",
          total: "Total",
          poaStatus: "POA status",
          hold: "Hold",
          paymentStatus: "Payment",
          bookingStatus: "Booking",
          evidence: "Evidence",
          createdAt: "Created",
          actions: "Action",
        }}
        facetFilters={[
          {
            columnId: "kind",
            title: "Kind",
            options: [
              { value: "registration", label: "Registration" },
              { value: "booking", label: "Booking" },
            ],
          },
          {
            columnId: "poaStatus",
            title: "POA status",
            options: ["pending", "evidence_submitted", "confirmed"].map(
              (value) => ({ value, label: poaStatusMeta(value).label }),
            ),
          },
          {
            columnId: "hold",
            title: "Hold",
            options: [
              { value: "held", label: "Held for the desk" },
              { value: "released", label: "Released" },
            ],
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
            ].map((value) => ({ value, label: value.replace(/_/g, " ") })),
          },
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
        ]}
        // Only a live IOU can be confirmed, so only those rows are selectable.
        enableRowSelection={(row) => isConfirmable(row.original)}
        bulkActions={({ selectedRows, clearSelection }) => (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setConfirmNote("");
              setBulkTarget({ rows: selectedRows, clear: clearSelection });
            }}
          >
            <HandCoins className="size-4" />
            Confirm selected ({selectedRows.length})
          </Button>
        )}
      />

      <p className="text-xs text-muted-foreground">
        Click a row for the full record — accommodation types, guest roster,
        evidence, notes and the payment timeline. POA beds are not released by
        the reservation window: a hold stays live until the desk confirms the
        payment or closes the booking.
      </p>

      {/* Row detail — the whole record behind the click. */}
      <RowDetailDialog
        open={!!detailsRow}
        onOpenChange={(open) => !open && setDetailsRow(null)}
        title={
          detailsRow
            ? `${detailsRow.kind === "registration" ? "Registration" : "Accommodation booking"} ${detailsRow.referenceNumber || "(pending)"}`
            : ""
        }
        summary={
          detailsRow ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("text-[10px]", poaStatusMeta(detailsRow.poaStatus).className)}>
                {poaStatusMeta(detailsRow.poaStatus).label}
              </Badge>
              {detailsRow.released && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Released — beds back in the pool
                </Badge>
              )}
              <span>
                {detailsRow.currency} {detailsRow.totalAmount.toLocaleString()}
              </span>
            </span>
          ) : null
        }
        footer={
          detailsRow && isConfirmable(detailsRow) ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDetailsRow(null)}
                disabled={busy}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  const row = detailsRow;
                  setDetailsRow(null);
                  if (row) openConfirm(row);
                }}
                disabled={busy}
              >
                <HandCoins className="size-4" /> Confirm payment
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailsRow ? (
          <>
            <RowDetailSection title="Record">
              <RowDetailList>
                <RowDetailItem label="Hub">{detailsRow.hubName}</RowDetailItem>
                <RowDetailItem label="Region">{detailsRow.region}</RowDetailItem>
                <RowDetailItem label="Reference">
                  <span className="font-mono text-xs">
                    {detailsRow.referenceNumber || "(pending)"}
                  </span>
                </RowDetailItem>
                <RowDetailItem label="Units">
                  {detailsRow.kind === "registration"
                    ? `${detailsRow.units} delegate(s)`
                    : `${detailsRow.units} active guest(s)`}
                </RowDetailItem>
                <RowDetailItem label="Total">
                  {detailsRow.currency} {detailsRow.totalAmount.toLocaleString()}
                </RowDetailItem>
                <RowDetailItem label="Payment status">
                  <span className="capitalize">
                    {detailsRow.paymentStatus.replace(/_/g, " ")}
                  </span>
                </RowDetailItem>
                <RowDetailItem label="Created">
                  {formatWhen(detailsRow.createdAt)}
                </RowDetailItem>
                <RowDetailItem label="POA status">
                  {poaStatusMeta(detailsRow.poaStatus).label}
                </RowDetailItem>
                {detailsRow.kind === "booking" && (
                  <>
                    <RowDetailItem label="Booking status">
                      <span className="capitalize">
                        {detailsRow.bookingStatus ?? "—"}
                      </span>
                    </RowDetailItem>
                    <RowDetailItem label="Hold">
                      {detailsRow.released
                        ? "Released — beds returned to their pools"
                        : // Every row here is on POA terms, so its beds wait for
                          // the desk — the reservation window never releases them.
                          "Held until the desk confirms the payment"}
                    </RowDetailItem>
                  </>
                )}
              </RowDetailList>
            </RowDetailSection>

            <RowDetailSection title="Accommodation">
              {detailsRow.accommodation.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Registrations do not hold beds — this record only registers
                  delegates.
                </p>
              ) : (
                <ul className="space-y-1">
                  {detailsRow.accommodation.map((entry) => (
                    <li
                      key={entry.type}
                      className="flex items-center gap-2 text-sm"
                    >
                      <BedDouble className="size-4 text-muted-foreground" />
                      <span>{entry.label}</span>
                      <span className="text-muted-foreground">
                        · {entry.units} bed(s) held
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </RowDetailSection>

            {detailsRow.kind === "booking" && (
              <RowDetailSection title="Guest roster">
                {detailsRow.guests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active guests.</p>
                ) : (
                  <ul className="space-y-1">
                    {detailsRow.guests.map((guest, index) => (
                      <li key={`${guest.name}-${index}`} className="text-sm">
                        {guest.name}
                        <span className="text-muted-foreground">
                          {" "}
                          · {guest.type} · {guest.gender}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </RowDetailSection>
            )}

            <RowDetailSection title="Evidence & notes">
              <RowDetailList>
                <RowDetailItem label="Evidence">
                  {detailsRow.evidenceUrl ? (
                    <a
                      href={detailsRow.evidenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {detailsRow.evidenceFileName ?? "view"}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">not submitted</span>
                  )}
                </RowDetailItem>
                <RowDetailItem label="Submitted">
                  {formatWhen(detailsRow.submittedAt)}
                </RowDetailItem>
                <RowDetailItem label="Confirmed">
                  {formatWhen(detailsRow.confirmedAt)}
                </RowDetailItem>
                <RowDetailItem label="Confirmed by">
                  {detailsRow.confirmedBy ?? "—"}
                </RowDetailItem>
                <RowDetailItem label="Rep note" className="sm:col-span-2">
                  {detailsRow.note ?? "—"}
                </RowDetailItem>
              </RowDetailList>
            </RowDetailSection>
          </>
        ) : null}
      </RowDetailDialog>

      {/* Single confirm — credits the total and flips the IOU to a paid receipt. */}
      <Dialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm payment on arrival</DialogTitle>
            <DialogDescription>
              {confirmTarget
                ? `Credit ${confirmTarget.currency} ${confirmTarget.totalAmount} for ${confirmTarget.kind === "registration" ? "registration" : "accommodation booking"} ${confirmTarget.referenceNumber || "(pending)"} from ${confirmTarget.hubName}?`
                : ""}{" "}
              The rep is notified and their IOU receipt becomes a paid receipt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="poa-confirm-note">Note (optional)</Label>
              <Textarea
                id="poa-confirm-note"
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                placeholder="e.g. cash received at the convention desk"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void handleConfirm()} disabled={busy}>
              Confirm payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk confirm — every selected IOU in one credit, per-currency totals. */}
      <Dialog
        open={bulkTarget !== null}
        onOpenChange={(open) => !open && setBulkTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Confirm {bulkRows.length} payment{bulkRows.length === 1 ? "" : "s"} on arrival
            </DialogTitle>
            <DialogDescription>
              Each selected record is credited and its IOU receipt becomes a
              paid receipt. Accommodation holds are confirmed and their beds
              locked in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Hub</TableHead>
                    <TableHead>Accommodation</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkRows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="font-mono text-xs">
                        {row.referenceNumber || "(pending)"}
                      </TableCell>
                      <TableCell className="max-w-32 truncate text-xs">
                        {row.hubName}
                      </TableCell>
                      <TableCell className="max-w-40 text-xs">
                        {row.accommodation.length === 0
                          ? "—"
                          : row.accommodation
                              .map((entry) => entry.label)
                              .join(", ")}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {row.currency} {row.totalAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-1 rounded-lg bg-muted/50 p-3">
              {totalsByCurrency(bulkRows).map(([currency, amount]) => (
                <p
                  key={currency}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    Total to credit ({currency})
                  </span>
                  <span className="font-semibold tabular-nums">
                    {currency} {amount.toLocaleString()}
                  </span>
                </p>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="poa-bulk-note">Note (optional)</Label>
              <Textarea
                id="poa-bulk-note"
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                placeholder="e.g. cash received at the convention desk"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleBulkConfirm()}
              disabled={busy || bulkRows.length === 0}
            >
              {busy
                ? "Confirming…"
                : `Confirm ${bulkRows.length} payment${bulkRows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warning" | "info" | "positive";
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "info" && "text-sky-700 dark:text-sky-400",
          tone === "positive" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
