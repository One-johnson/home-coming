"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftRight,
  BadgeCheckIcon,
  ChevronDown,
  ClipboardCheck,
  HandCoins,
  Printer,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { AgcExcelExportButton } from "@/components/admin/agc/AgcAdminClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { cn } from "@/lib/utils";

/**
 * Venue-desk payment-on-arrival check-in. The desk searches by reference,
 * hub, or guest name, ticks rows off as cash arrives (a local checklist that
 * survives reloads for the shift), and confirms each payment in one tap —
 * the same credit the POA tables perform, with a desk note pre-filled so
 * the audit trail says "collected at the venue desk".
 *
 * `?hub=<id>` pre-filters the sheet to one hub; clear the filter to see all.
 */

type DeskRow = {
  kind: "registration" | "booking";
  recordId: string;
  referenceNumber: string;
  hubId: string;
  hubName: string;
  region: string;
  currency: string;
  totalAmount: number;
  units: number;
  poaStatus: string;
  paymentStatus: string;
  bookingStatus: string | null;
  evidenceFileName: string | null;
  note: string | null;
  guests: Array<{ name: string; type: string; gender: string }>;
  createdAt: number;
};

const DESK_NOTE = "Cash collected at the venue desk (check-in).";

const TICK_STORAGE_KEY = "homecoming-desk-checkin-ticks-v1";

function loadTicked(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TICK_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function saveTicked(ids: string[]) {
  try {
    window.localStorage.setItem(TICK_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage disabled (private mode) — tick-off just won't persist.
  }
}

export function DeskCheckinPage() {
  const { sessionToken } = useAdminSession();
  const rows = useQuery(
    api.agcPoa.listPoaDeskData,
    sessionToken ? { sessionToken } : "skip",
  );
  const confirmPoa = useMutation(api.agcPoa.confirmPoaPayment);

  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>(() => loadTicked());

  // Live rows + ticked ids that no longer exist → converged checklist.
  const tickSet = useMemo(() => {
    const live = new Set((rows ?? []).map((row) => row.recordId));
    return new Set(ticked.filter((id) => live.has(id)));
  }, [rows, ticked]);

  const toggleTick = (recordId: string) => {
    setTicked((prev) => {
      const next = prev.includes(recordId)
        ? prev.filter((id) => id !== recordId)
        : [...prev, recordId];
      saveTicked(next);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const all = rows ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (row) =>
        row.referenceNumber.toLowerCase().includes(term) ||
        row.hubName.toLowerCase().includes(term) ||
        row.guests.some((guest) => guest.name.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const due: Record<string, { amount: number; rows: number; ticked: number }> = {};
    for (const row of filtered) {
      const entry = (due[row.currency] ??= { amount: 0, rows: 0, ticked: 0 });
      entry.amount += row.totalAmount;
      entry.rows += 1;
      if (tickSet.has(row.recordId)) entry.ticked += 1;
    }
    return due;
  }, [filtered, tickSet]);

  const handleConfirm = async (row: DeskRow) => {
    if (!sessionToken) return;
    setBusyId(row.recordId);
    try {
      await confirmPoa({
        sessionToken,
        kind: row.kind,
        recordId: row.recordId,
        note: DESK_NOTE,
      });
      toast.success(
        `${row.currency} ${row.totalAmount} collected for ${row.referenceNumber || "record"} — IOU is now a paid receipt.`,
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to confirm payment"));
    } finally {
      setBusyId(null);
    }
  };

  const pending = (rows ?? []).filter(
    (row) => !tickSet.has(row.recordId),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Reference, hub, or guest name…"
            className="h-10 pl-8 text-base"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <AgcExcelExportButton
          which="poa-reconciliation"
          label="End-of-day reconciliation (.xlsx)"
        />
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Print sheet
        </Button>
        {ticked.length > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              setTicked([]);
              saveTicked([]);
            }}
          >
            <RotateCcwIcon className="size-4" /> Reset ticks ({ticked.length})
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Awaiting collection"
          value={pending}
          tone={pending > 0 ? "warning" : "default"}
          hint={`${(rows ?? []).length} POA record(s) on the sheet`}
        />
        {Object.entries(totals)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([currency, entry]) => (
            <Stat
              key={currency}
              label={`Collected cash (${currency})`}
              value={entry.amount.toLocaleString()}
              tone="info"
              hint={`${entry.ticked}/${entry.rows} row(s) ticked`}
            />
          ))}
        {Object.keys(totals).length === 0 && (
          <Stat label="Collected cash" value="—" hint="no rows" />
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 print:table-cell"></TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Hub</TableHead>
              <TableHead>Guests / delegates</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Amount due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Collect</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {search
                    ? "No record matches the search — check the reference or guest spelling."
                    : (rows ?? []).length === 0
                      ? "Nothing to collect — every payment-on-arrival record is confirmed."
                      : "No rows."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const isTicked = tickSet.has(row.recordId);
                return (
                  <TableRow
                    key={row.recordId}
                    className={cn(
                      "transition-colors",
                      isTicked && "bg-emerald-50/70 dark:bg-emerald-950/30",
                    )}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Ticked off ${row.referenceNumber || row.recordId}`}
                        className="size-4 cursor-pointer"
                        checked={isTicked}
                        onChange={() => toggleTick(row.recordId)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.referenceNumber || "(pending)"}
                      {row.kind === "booking" ? (
                        <span className="ml-1 text-muted-foreground">· stay</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-36 truncate text-sm">
                      {row.hubName}
                    </TableCell>
                    <TableCell className="max-w-72">
                      {row.guests.length > 0 ? (
                        <div className="space-y-0.5">
                          {row.guests.slice(0, 4).map((guest, index) => (
                            <p key={index} className="truncate text-xs">
                              {guest.name}
                              <span className="text-muted-foreground">
                                {" "}· {guest.type}
                              </span>
                            </p>
                          ))}
                          {row.guests.length > 4 && (
                            <p className="text-xs text-muted-foreground">
                              +{row.guests.length - 4} more
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.units}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {row.currency} {row.totalAmount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          row.poaStatus === "evidence_submitted"
                            ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
                        )}
                      >
                        {row.poaStatus === "evidence_submitted"
                          ? "evidence submitted"
                          : "IOU pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.poaStatus === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <BadgeCheckIcon className="size-3.5" /> collected
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId === row.recordId}
                          onClick={() => void handleConfirm(row)}
                        >
                          <HandCoins className="size-4" />
                          {busyId === row.recordId ? "Confirming…" : "Cash received"}
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

      <Card className="print:hidden">
        <CardContent className="flex items-start gap-2 p-3 text-xs text-muted-foreground">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            Ticks are kept on this device only — they are a desk checklist, not
            payment records. “Cash received” confirms the payment system-wide
            (credits the IOU, unlocks the beds for bookings) and should be
            tapped only when the money is in hand.
          </p>
        </CardContent>
      </Card>

      <EndOfDayReconciliation />
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
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "warning" && "text-amber-700 dark:text-amber-400",
            tone === "info" && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * End-of-day reconciliation: cash confirmed today (desk vs pre-paid with
 * evidence) against the IOUs still outstanding — per hub + currency, with
 * per-currency totals so the drawer can be cashed up against the books.
 * Collapsible by default; prints with the sheet when the page is printed.
 */
function EndOfDayReconciliation() {
  const { sessionToken } = useAdminSession();
  const [open, setOpen] = useState(false);
  const reconciliation = useQuery(
    api.agcPoa.getPoaDailyReconciliation,
    sessionToken && open ? { sessionToken } : "skip",
  );

  const day = reconciliation
    ? new Date(reconciliation.dayStart).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Today";

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center gap-2 p-3 text-left"
        >
          <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">
            End-of-day reconciliation — cash vs confirmed IOUs
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {open && (
          <div className="border-t p-3">
            {!reconciliation ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{day}</p>
                {reconciliation.rows.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No payment-on-arrival activity yet — nothing to reconcile.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Hub</TableHead>
                          <TableHead>Currency</TableHead>
                          <TableHead className="text-right">Desk cash</TableHead>
                          <TableHead className="text-right">Pre-paid online</TableHead>
                          <TableHead className="text-right">Collected total</TableHead>
                          <TableHead className="text-right">Still outstanding</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reconciliation.rows.map((row) => (
                          <TableRow key={`${row.hubName}-${row.currency}`}>
                            <TableCell className="text-sm">{row.hubName}</TableCell>
                            <TableCell className="text-sm">{row.currency}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {row.collectedDeskCount > 0
                                ? `${row.currency} ${row.collectedAmount.toLocaleString()} (${row.collectedDeskCount})`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {row.collectedOnlineCount > 0
                                ? `(${row.collectedOnlineCount}) `
                                : ""}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {row.collectedCount > 0
                                ? `${row.currency} ${row.collectedAmount.toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.outstandingCount > 0 ? (
                                <span className="text-amber-700 dark:text-amber-400">
                                  {row.currency} {row.outstandingAmount.toLocaleString()} ({row.outstandingCount})
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {Object.entries(reconciliation.byCurrency).map(
                          ([currency, agg]) => (
                            <TableRow key={`total-${currency}`} className="bg-muted/40 font-semibold">
                              <TableCell colSpan={2}>Total ({currency})</TableCell>
                              <TableCell> </TableCell>
                              <TableCell> </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {agg.collected.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {agg.outstanding.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ),
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  “Collected total” = payments confirmed today; rows with no
                  evidence were collected as desk cash, “pre-paid online” rows
                  were paid by bank/MoMo earlier. Compare the desk-cash figure
                  with the drawer before closing the shift.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
