"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheckIcon, HandCoins, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
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
 * Combined payment-on-arrival status table for admin + finance: one row per
 * POA registration or accommodation booking, with the evidence link and the
 * "confirm payment" action that credits the total and converts the IOU
 * receipt into a paid receipt.
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
  createdAt: number;
  submittedAt: number | null;
  confirmedAt: number | null;
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

export function PoaTab() {
  const { sessionToken, user } = useAdminSession();
  const rows = useQuery(
    api.agcPoa.listPoaRecordsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const confirmPoa = useMutation(api.agcPoa.confirmPoaPayment);

  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<PoaRow | null>(null);
  const [confirmNote, setConfirmNote] = useState("");
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
          row.hubName.toLowerCase().includes(term)),
    );
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      outstanding: all.filter(
        (row: PoaRow) => row.poaStatus !== "confirmed",
      ).length,
      outstandingAmount: all
        .filter((row: PoaRow) => row.poaStatus !== "confirmed")
        .reduce((sum, row: PoaRow) => sum + row.totalAmount, 0),
    };
  }, [rows]);

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

  if (!canAct) {
    return (
      <p className="text-sm text-muted-foreground">
        The payment-on-arrival table is available to admins and finance.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="POA records" value={counts.total} />
        <Stat label="Awaiting payment" value={counts.outstanding} tone="warning" />
        <Stat
          label="Outstanding total"
          value={counts.outstandingAmount.toLocaleString()}
          hint="not credited until confirmed"
          tone="info"
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
          placeholder="Reference or hub…"
          className="ml-auto h-9 w-52"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kind</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Hub</TableHead>
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
                <TableCell colSpan={10}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  No payment-on-arrival records yet. Grant hubs the feature in
                  Settings → Payment on arrival; new POA registrations and
                  bookings appear here.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row: PoaRow) => {
                const meta = poaStatusMeta(row.poaStatus);
                return (
                  <TableRow key={row._id}>
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
                    <TableCell className="text-right tabular-nums">
                      {row.units}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currency} {row.totalAmount}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {row.paymentStatus.replace(/_/g, " ")}
                      {row.bookingStatus ? ` · ${row.bookingStatus}` : ""}
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="text-right">
                      {row.poaStatus === "confirmed" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <BadgeCheckIcon className="size-3.5" />
                          {formatWhen(row.confirmedAt)}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setConfirmNote("");
                            setConfirmTarget(row);
                          }}
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

      {/* Confirm dialog — credits the total and flips the IOU to a paid receipt. */}
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
