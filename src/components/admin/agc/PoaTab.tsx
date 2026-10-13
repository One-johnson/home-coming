"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "IOU pending" },
  { id: "evidence_submitted", label: "Evidence submitted" },
  { id: "confirmed", label: "Confirmed" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

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

  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [detailsRow, setDetailsRow] = useState<PoaRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<PoaRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canAct = user?.role === "admin" || user?.role === "finance";

  const filtered = useMemo(() => {
    const all = rows ?? [];
    const term = search.trim().toLowerCase();
    return all.filter(
      (row: PoaRow) =>
        (filter === "all" || row.poaStatus === filter) &&
        (!term ||
          row.referenceNumber.toLowerCase().includes(term) ||
          row.hubName.toLowerCase().includes(term) ||
          row.accommodation.some((entry) =>
            entry.label.toLowerCase().includes(term),
          ) ||
          row.guests.some((guest) =>
            guest.name.toLowerCase().includes(term),
          )),
    );
  }, [rows, filter, search]);

  // Selection is kept to rows that are still on screen (filters hide rows).
  const selectedRows = useMemo(
    () => filtered.filter((row) => selected.includes(row._id) && isConfirmable(row)),
    [filtered, selected],
  );
  const selectableRows = useMemo(
    () => filtered.filter(isConfirmable),
    [filtered],
  );
  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((row) => selected.includes(row._id));

  const toggleSelected = (row: PoaRow) => {
    setSelected((prev) =>
      prev.includes(row._id)
        ? prev.filter((id) => id !== row._id)
        : [...prev, row._id],
    );
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : selectableRows.map((row) => row._id));
  };

  const counts = useMemo(() => {
    const all = rows ?? [];
    const outstanding = all.filter((row: PoaRow) => row.poaStatus !== "confirmed");
    const released = outstanding.filter((row: PoaRow) => row.released);
    const collectible = outstanding.filter((row: PoaRow) => !row.released);
    return {
      total: all.length,
      outstanding: outstanding.length,
      released: released.length,
      outstandingLabel:
        totalsByCurrency(collectible)
          .map(([currency, value]) => `${currency} ${value.toLocaleString()}`)
          .join(" · ") || "0",
    };
  }, [rows]);

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
      setSelected((prev) => prev.filter((id) => id !== confirmTarget._id));
      setConfirmTarget(null);
      setConfirmNote("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to confirm payment"));
    } finally {
      setBusy(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (!sessionToken || selectedRows.length === 0) return;
    setBusy(true);
    try {
      const result = await confirmPoaBulk({
        sessionToken,
        records: selectedRows.map((row) => ({
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
      setSelected([]);
      setBulkOpen(false);
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
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="POA records" value={counts.total} />
        <Stat label="Awaiting payment" value={counts.outstanding} tone="warning" />
        <Stat
          label="Outstanding total"
          value={counts.outstandingLabel}
          hint="not credited until confirmed — per currency"
          tone="info"
        />
        <Stat
          label="Holds released"
          value={counts.released}
          hint="72h expired — beds back in their pools"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.id
                ? "border-gold bg-gold/15 text-ink"
                : "text-muted-foreground hover:border-gold/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        <Input
          type="search"
          placeholder="Reference, hub, guest, or type…"
          className="ml-auto h-9 w-56"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={selectedRows.length === 0}
          onClick={() => {
            setConfirmNote("");
            setBulkOpen(true);
          }}
        >
          <HandCoins className="size-4" />
          Confirm selected ({selectedRows.length})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select every confirmable payment"
                  className="size-4 cursor-pointer"
                  checked={allSelected}
                  disabled={selectableRows.length === 0}
                  onChange={toggleAll}
                />
              </TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Hub</TableHead>
              <TableHead>Accommodation</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>POA status</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableRow>
                <TableCell colSpan={12}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                  No payment-on-arrival records yet. Grant hubs the feature in
                  Settings → Payment on arrival; new POA registrations and
                  bookings appear here.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row: PoaRow) => {
                const meta = poaStatusMeta(row.poaStatus);
                const confirmable = isConfirmable(row);
                return (
                  <TableRow
                    key={row._id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => setDetailsRow(row)}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.referenceNumber || row._id}`}
                        className="size-4 cursor-pointer disabled:cursor-not-allowed"
                        checked={selected.includes(row._id)}
                        disabled={!confirmable}
                        onChange={() => toggleSelected(row)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {row.kind === "registration" ? "Registration" : "Booking"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.referenceNumber || "(pending)"}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm">
                      {row.hubName}
                    </TableCell>
                    <TableCell className="max-w-56">
                      {row.accommodation.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          n/a (delegates)
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          {row.accommodation.map((entry) => (
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
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.units}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currency} {row.totalAmount}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                          {meta.label}
                        </Badge>
                        {row.released && (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            title="The 72h hold lapsed — the beds went back into their pools."
                          >
                            <Undo2Icon className="size-3" /> Released
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {row.paymentStatus.replace(/_/g, " ")}
                      {row.bookingStatus ? ` · ${row.bookingStatus}` : ""}
                    </TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      {row.evidenceUrl ? (
                        <a
                          href={row.evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <LinkIcon className="size-3" /> {row.evidenceFileName ?? "view"}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatWhen(row.createdAt)}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.poaStatus === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <BadgeCheckIcon className="size-3.5" />
                          {formatWhen(row.confirmedAt)}
                        </span>
                      ) : row.released ? (
                        <span className="text-xs text-muted-foreground">
                          beds released
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openConfirm(row)}
                        >
                          <HandCoins className="size-4" /> Confirm payment
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Click a row for the full record — accommodation types, guest roster,
        evidence, notes and the payment timeline.
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
                        : detailsRow.expiresAt
                          ? `Expires ${formatWhen(detailsRow.expiresAt)}`
                          : "Until confirmed"}
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
      <Dialog open={bulkOpen} onOpenChange={(open) => !open && setBulkOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Confirm {selectedRows.length} payment{selectedRows.length === 1 ? "" : "s"} on arrival
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
                  {selectedRows.map((row) => (
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
              {totalsByCurrency(selectedRows).map(([currency, amount]) => (
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
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void handleBulkConfirm()} disabled={busy}>
              {busy
                ? "Confirming…"
                : `Confirm ${selectedRows.length} payment${selectedRows.length === 1 ? "" : "s"}`}
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
  tone?: "default" | "warning" | "info";
}) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "info" && "text-sky-700 dark:text-sky-400",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
