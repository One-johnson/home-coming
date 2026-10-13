"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Hourglass, MoveRight, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { AgcExcelExportButton } from "@/components/admin/agc/AgcAdminClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatTile } from "@/components/portal/StatTile";
import { cn } from "@/lib/utils";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";

type PoolRow = {
  _id: string;
  accommodationType: string;
  scope: string;
  total: number;
  /** Live held beds: active reservations that have not expired. */
  reserved: number;
  confirmed: number;
  available: number;
  /**
   * What the pool's own counter still says. Larger than `reserved` when the
   * ledger has not released a finished booking yet (the repair fixes it).
   */
  ledgerReserved: number;
};

type ExpiringHold = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  totalAmount: number;
  currency: string;
  expiresAt: number;
};

type PoolRepair = {
  _id: string;
  kind: "run" | "booking";
  actorEmail: string;
  summary: string;
  referenceNumber: string | null;
  units: number | null;
  bookings: number | null;
  expiredHolds: number | null;
  bookingStatus: string | null;
  createdAt: number;
};

type Reallocation = {
  _id: string;
  accommodationType: string;
  fromScope: string;
  toScope: string;
  quantity: number;
  actorEmail: string;
  note: string | null;
  createdAt: number;
};

const TYPE_LABEL = (type: string) =>
  AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;
const SCOPE_LABEL = (scope: string) => scope.replace(/_/g, " ");

function hoursUntil(ts: number) {
  const hours = Math.max(0, (ts - Date.now()) / (60 * 60 * 1000));
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function PoolsTab() {
  const { sessionToken } = useAdminSession();
  const pools = useQuery(
    api.agcAdminData.listPoolsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const expiring = useQuery(
    api.agcAdminData.listExpiringHoldsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const reallocations = useQuery(
    api.agcAdminData.listReallocationsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const repairs = useQuery(
    api.agcAdminData.listPoolRepairsAdmin,
    sessionToken ? { sessionToken } : "skip",
  ) as PoolRepair[] | undefined;
  const reallocate = useMutation(api.agcAdminData.reallocatePool);
  const addCapacity = useMutation(api.agcAdminData.addPoolCapacity);
  const returnExpiredBeds = useMutation(
    api.agcAdminData.returnExpiredBookingsToPools,
  );
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [form, setForm] = useState({
    accommodationType: "dormitory",
    fromScope: "africa",
    toScope: "rest_of_world",
    quantity: "10",
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Per-pool capacity top-up (extra rooms/beds added to an accommodation).
  const [topUpPool, setTopUpPool] = useState<PoolRow | null>(null);
  const [topUpQuantity, setTopUpQuantity] = useState("10");
  const [topUpNote, setTopUpNote] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const topUpQty = Number(topUpQuantity);
  const topUpError = !Number.isInteger(topUpQty) || topUpQty <= 0
    ? "Quantity must be a whole number of at least 1"
    : null;

  const handleTopUp = async () => {
    if (!sessionToken || !topUpPool || topUpError) return;
    setTopUpBusy(true);
    try {
      await addCapacity({
        sessionToken,
        poolId: topUpPool._id as Id<"agcInventoryPools">,
        quantity: topUpQty,
        note: topUpNote.trim() || undefined,
      });
      toast.success(
        `Added ${topUpQty} unit(s) — ${TYPE_LABEL(topUpPool.accommodationType)} (${SCOPE_LABEL(topUpPool.scope)}) total is now ${topUpPool.total + topUpQty}`,
      );
      setTopUpPool(null);
      setTopUpNote("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Capacity top-up failed"));
    } finally {
      setTopUpBusy(false);
    }
  };

  /**
   * Return every bed a finished booking still holds. Expires lapsed holds
   * first, then only returns the beds the ledger has no release for — safe to
   * run more than once.
   */
  const handleReturnExpiredBeds = async () => {
    if (!sessionToken) return;
    setReconciling(true);
    try {
      const result = await returnExpiredBeds({ sessionToken });
      toast.success(
        result.units > 0
          ? `Returned ${result.units} bed(s) from ${result.bookings} finished booking(s) to their pools`
          : "Nothing to return — every finished booking has already released its beds",
        {
          description: result.expiredHolds
            ? `${result.expiredHolds} lapsed hold(s) were also expired in this pass.`
            : undefined,
        },
      );
      setReconcileOpen(false);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Reconciliation failed"));
    } finally {
      setReconciling(false);
    }
  };

  const list = pools ?? [];
  // Beds the pool counters still hold that no live reservation occupies —
  // expired reservations nobody released. Surfaced instead of hidden so the
  // desk knows the repair is worth running.
  const ledgerDrift = list.reduce(
    (sum, p: PoolRow) => sum + Math.max(0, p.ledgerReserved - p.reserved),
    0,
  );
  const totals = list.reduce(
    (acc, p: PoolRow) => ({
      total: acc.total + p.total,
      available: acc.available + p.available,
      held: acc.held + p.reserved,
      confirmed: acc.confirmed + p.confirmed,
    }),
    { total: 0, available: 0, held: 0, confirmed: 0 },
  );

  const sourcePool = list.find(
    (p) =>
      p.accommodationType === form.accommodationType && p.scope === form.fromScope,
  );
  const quantity = Number(form.quantity);
  const validationError = useMemo(() => {
    if (!Number.isFinite(quantity) || quantity <= 0) return "Quantity must be a positive number";
    if (form.fromScope === form.toScope) return "Source and target pools must differ";
    if (sourcePool && quantity > sourcePool.available) {
      return `Source pool has only ${sourcePool.available} available`;
    }
    return null;
  }, [quantity, form.fromScope, form.toScope, sourcePool]);

  const handleReallocate = async () => {
    if (!sessionToken || validationError) return;
    setBusy(true);
    try {
      await reallocate({
        sessionToken,
        accommodationType: form.accommodationType as
          | "dormitory"
          | "hostel"
          | "wise_serpents"
          | "good_general"
          | "ebpv",
        fromScope: form.fromScope as "africa" | "rest_of_world" | "global",
        toScope: form.toScope as "africa" | "rest_of_world" | "global",
        quantity,
      });
      toast.success("Pool reallocation recorded");
      setConfirmOpen(false);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Reallocation failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AgcExcelExportButton
          which="inventory"
          label="Export inventory (.xlsx)"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total capacity" value={totals.total} />
        <StatTile label="Available" value={totals.available} tone="info" />
        <StatTile label="On hold" value={totals.held} tone="warning" />
        <StatTile label="Confirmed" value={totals.confirmed} tone="positive" />
      </div>

      {ledgerDrift > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {ledgerDrift} bed(s) still counted as held for finished bookings
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Expired and cancelled reservations do not count towards On hold or
            Available here. The pool ledger has not released them yet — run
            <span className="font-medium"> Move expired bookings back to pools</span>{" "}
            below (the nightly check does it on its own).
          </p>
        </div>
      )}

      {expiring && expiring.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            <Hourglass className="size-3.5" /> Holds expiring within 48h
          </p>
          <div className="flex flex-wrap gap-2">
            {expiring.map((hold: ExpiringHold) => (
              <Link
                key={hold._id}
                href={`/admin/accommodation?id=${hold._id}`}
                className="rounded-lg border border-amber-300 bg-white/80 px-2.5 py-1.5 text-xs hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:hover:bg-amber-900/40"
              >
                <span className="font-mono">{hold.referenceNumber || "(pending)"}</span>{" "}
                · {hold.hubName} ·{" "}
                <span className="font-semibold tabular-nums">
                  {hold.currency} {hold.totalAmount}
                </span>{" "}
                · expires in{" "}
                <span className="font-semibold">{hoursUntil(hold.expiresAt)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((pool: PoolRow) => {
          const taken = pool.reserved + pool.confirmed;
          const pct = pool.total > 0 ? Math.round((taken / pool.total) * 100) : 0;
          const barTone =
            pool.available <= 0
              ? "bg-rose-500"
              : pct >= 80
                ? "bg-amber-500"
                : "bg-emerald-500";
          return (
            <div key={pool._id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{TYPE_LABEL(pool.accommodationType)}</p>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {SCOPE_LABEL(pool.scope)}
                </Badge>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", barTone)} style={{ width: pct + "%" }} />
              </div>
              <div className="mt-2 flex items-center justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setTopUpQuantity("10");
                    setTopUpPool(pool);
                  }}
                >
                  <Plus className="size-3" /> Add capacity
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                <div>
                  <p className="text-sm font-semibold tabular-nums">{pool.available}</p>
                  <p className="text-[10px] text-muted-foreground">left</p>
                </div>
                <div
                  title={`${pool.reserved} active · ${pool.ledgerReserved} in the pool ledger`}
                >
                  <p className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">{pool.reserved}</p>
                  <p className="text-[10px] text-muted-foreground">held</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{pool.confirmed}</p>
                  <p className="text-[10px] text-muted-foreground">confirmed</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums">{pool.total}</p>
                  <p className="text-[10px] text-muted-foreground">total</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/*
        Finished bookings (expired/cancelled) must not keep holding beds. Any
        that still do — rows closed before the release existed — are returned
        here, from the pool each bed was drawn from.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Finished bookings still holding beds</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Expires lapsed holds, then returns every bed an expired or
            cancelled booking still occupies back into its pool. Safe to run
            again — beds already released are never returned twice.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setReconcileOpen(true)}
        >
          <RotateCcw className="size-3.5" /> Move expired bookings back to pools
        </Button>
      </div>

      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-4 text-amber-600" /> Return beds to
              their pools?
            </DialogTitle>
            <DialogDescription>
              Every expired or cancelled booking that still holds beds gives
              them back to the pool they came from, and any hold past its
              window is expired. Existing live reservations are untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setReconcileOpen(false)}
              disabled={reconciling}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleReturnExpiredBeds()}
              disabled={reconciling}
            >
              {reconciling ? "Returning…" : "Return beds"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reallocation — moves capacity between regional pools (audited). */}
      <div className="grid gap-3 rounded-xl border border-dashed p-4 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select
            value={form.accommodationType}
            onValueChange={(value) =>
              setForm({
                ...form,
                accommodationType: (value ?? form.accommodationType) as typeof form.accommodationType,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dormitory">Dormitory</SelectItem>
              <SelectItem value="hostel">Hostel</SelectItem>
              <SelectItem value="wise_serpents">Wise as Serpents</SelectItem>
              <SelectItem value="good_general">Good General Lodge</SelectItem>
              <SelectItem value="ebpv">EBPV</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>From scope</Label>
          <Select
            value={form.fromScope}
            onValueChange={(value) =>
              setForm({ ...form, fromScope: (value ?? form.fromScope) as typeof form.fromScope })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="africa">Africa</SelectItem>
              <SelectItem value="rest_of_world">Rest of world</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>To scope</Label>
          <Select
            value={form.toScope}
            onValueChange={(value) =>
              setForm({ ...form, toScope: (value ?? form.toScope) as typeof form.toScope })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rest_of_world">Rest of world</SelectItem>
              <SelectItem value="africa">Africa</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Quantity</Label>
          <Input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            aria-invalid={!!validationError}
          />
          {sourcePool && (
            <p className="text-[11px] text-muted-foreground">
              {sourcePool.available} available in source
            </p>
          )}
          {validationError && (
            <p className="text-[11px] font-medium text-rose-600">{validationError}</p>
          )}
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            disabled={!!validationError}
            onClick={() => setConfirmOpen(true)}
            className="h-10 w-full"
          >
            Reallocate
          </Button>
        </div>
      </div>

      {/* Capacity top-up — adds extra rooms/beds to a single pool (audited). */}
      <Dialog
        open={!!topUpPool}
        onOpenChange={(open) => !open && setTopUpPool(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4 text-emerald-600" /> Add capacity —{" "}
              {topUpPool ? TYPE_LABEL(topUpPool.accommodationType) : ""}
            </DialogTitle>
            <DialogDescription>
              Extra rooms/beds are added to the{" "}
              {topUpPool ? SCOPE_LABEL(topUpPool.scope) : ""} pool total. The
              change is recorded in the inventory ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="topup-qty">Extra units (beds)</Label>
              <Input
                id="topup-qty"
                type="number"
                min={1}
                step={1}
                value={topUpQuantity}
                onChange={(e) => setTopUpQuantity(e.target.value)}
                aria-invalid={!!topUpError}
              />
              {topUpError ? (
                <p className="text-[11px] font-medium text-rose-600">{topUpError}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {topUpPool?.total ?? 0} → {topUpPool ? topUpPool.total + topUpQty : 0} total
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topup-note">Note (optional)</Label>
              <Input
                id="topup-note"
                value={topUpNote}
                onChange={(e) => setTopUpNote(e.target.value)}
                placeholder="e.g. Block 9 opened"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setTopUpPool(null)}
              disabled={topUpBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleTopUp()}
              disabled={!!topUpError || topUpBusy}
            >
              Add {topUpQuantity || 0} units
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog before applying an audited capacity move. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-600" /> Confirm reallocation
            </DialogTitle>
            <DialogDescription>
              This move is recorded in the inventory ledger and cannot be
              undone automatically.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border bg-muted/40 p-3 text-sm">
            Move{" "}
            <strong className="tabular-nums">
              {quantity} × {TYPE_LABEL(form.accommodationType)}
            </strong>{" "}
            beds from <strong>{SCOPE_LABEL(form.fromScope)}</strong> to{" "}
            <strong>{SCOPE_LABEL(form.toScope)}</strong>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void handleReallocate()} disabled={busy}>
              <MoveRight className="size-4" /> Move {quantity}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recent repairs — what came back, how much, and who (or what) moved it. */}
      {repairs && repairs.length > 0 && (
        <div className="rounded-xl border p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <RotateCcw className="size-3.5" /> Recent pool repairs
          </p>
          <ul className="space-y-1 text-xs">
            {repairs.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center gap-1.5"
              >
                {row.kind === "booking" ? (
                  <>
                    <span className="font-mono font-medium">
                      {row.referenceNumber || "(pending)"}
                    </span>
                    <span className="tabular-nums">
                      ×{row.units ?? "?"} bed{(row.units ?? 0) === 1 ? "" : "s"}
                    </span>
                    {row.bookingStatus ? (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {row.bookingStatus}
                      </Badge>
                    ) : null}
                  </>
                ) : (
                  <span className="font-medium">
                    Returned {row.units ?? 0} bed(s) from {row.bookings ?? 0}{" "}
                    finished booking(s)
                  </span>
                )}
                <span className="text-muted-foreground">
                  · {row.actorEmail === "system" ? "nightly check" : row.actorEmail}{" "}
                  · {new Date(row.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent reallocations — server already records each move. */}
      {reallocations && reallocations.length > 0 && (
        <div className="rounded-xl border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent reallocations
          </p>
          <ul className="space-y-1 text-xs">
            {reallocations.map((row: Reallocation) => (
              <li key={row._id} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{TYPE_LABEL(row.accommodationType)}</span>
                <span className="tabular-nums">×{row.quantity}</span>
                <MoveRight className="size-3 text-muted-foreground" />
                {SCOPE_LABEL(row.fromScope)} → {SCOPE_LABEL(row.toScope)}
                <span className="text-muted-foreground">
                  · {row.actorEmail} · {new Date(row.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
