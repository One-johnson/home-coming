"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  AlertTriangle,
  ChevronRight,
  Eraser,
  History,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { cn } from "@/lib/utils";
import { paymentStatusMeta } from "@/lib/agcPortal";

export type ReviewDecision = "approve" | "reject" | "request_correction";

// ------------------------------------------------------------------
// Amount-mismatch + aging helpers (shared by registrations & bookings)
// ------------------------------------------------------------------

/**
 * Exact-amount rule — an offline payment must equal the system total.
 * Tolerance mirrors amountsMatch (half a cent, float safety).
 */
export function amountMismatch(
  amountPaid: number | undefined,
  totalAmount: number,
): boolean {
  if (amountPaid === undefined) return false;
  return Math.abs(amountPaid - totalAmount) >= 0.005;
}

/** Whole days since createdAt, for the aging badge. */
export function ageInDays(createdAt: number): number {
  return Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));
}

export function paysMeta(value: string) {
  return paymentStatusMeta(value);
}

/** Review-history timeline for one record (source: audit log). */
export function ReviewHistorySection({
  entityType,
  entityId,
}: {
  entityType: "agcRegistrations" | "agcBookings";
  entityId: string;
}) {
  const { sessionToken } = useAdminSession();
  const events = useQuery(
    api.agcAdminData.listAgcRecordHistory,
    sessionToken ? { sessionToken, entityType, entityId } : "skip",
  );
  if (!events?.length) return null;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="size-3.5" /> History
      </p>
      <ol className="space-y-1.5">
        {events.map((event) => (
          <li key={event._id} className="text-xs leading-snug">
            <span className="font-medium">{event.action}</span>
            {" · "}
            <span className="text-muted-foreground">
              {event.actorEmail ?? "system"} ·{" "}
              {new Date(event.createdAt).toLocaleString()}
            </span>
            {typeof event.message === "string" && event.message ? (
              <span className="block text-muted-foreground italic">
                “{event.message}”
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------
// Bulk review (approve / request correction) with confirmation
// ------------------------------------------------------------------

export function BulkReviewDialog({
  kind,
  selected,
  onDone,
}: {
  kind: "registrations" | "bookings";
  selected: { _id: string; label: string }[];
  onDone: () => void;
}) {
  const { sessionToken } = useAdminSession();
  const reviewRegs = useMutation(api.agcAdminData.bulkReviewAgcRegistrations);
  const reviewBookings = useMutation(api.agcAdminData.bulkReviewAgcBookings);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<"approve" | "request_correction">(
    "approve",
  );
  const [message, setMessage] = useState("");
  const noun = kind === "registrations" ? "registration" : "booking";
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(
    null,
  );

  useEffect(() => {
    if (result) onDone();
  }, [result, onDone]);

  const run = async () => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const ids = selected.map((r) => r._id) as Id<"agcRegistrations">[];
      const args = { sessionToken, ids, decision, message: message || undefined };
      const outcome =
        kind === "registrations"
          ? await reviewRegs(args)
          : await reviewBookings(args as never);
      setResult(outcome);
      toast.success(
        `${outcome.updated} ${noun}(s) updated` +
          (outcome.skipped ? ` — ${outcome.skipped} skipped (not awaiting review)` : ""),
      );
      setOpen(false);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk review failed"));
    } finally {
      setBusy(false);
    }
  };

  const needsMessage = decision === "request_correction";

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : onDone())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {decision === "approve" ? "Approve" : "Request correction on"}{" "}
            {selected.length} {noun}
            {selected.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            {decision === "approve"
              ? "All selected items currently awaiting verification will be confirmed. One summary email per hub is sent."
              : "All selected items will be marked for correction with your message. One summary email per hub is sent."}
          </DialogDescription>
        </DialogHeader>
        {result ? null : (
          <div className="space-y-3">
            <div className="max-h-32 overflow-y-auto rounded-lg border bg-muted/40 p-2 text-xs">
              {selected.slice(0, 30).map((row) => (
                <p key={row._id} className="truncate">
                  {row.label}
                </p>
              ))}
              {selected.length > 30 && (
                <p className="text-muted-foreground">
                  … and {selected.length - 30} more
                </p>
              )}
            </div>
            <Textarea
              rows={2}
              placeholder={
                needsMessage
                  ? "Required — what should the representatives fix?"
                  : "Optional message to representatives"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={busy}
                onClick={() => void run()}
                className={cn(
                  decision === "approve" && "bg-emerald-600 text-white hover:bg-emerald-700",
                )}
              >
                Confirm{" "}
                {decision === "approve" ? "approval" : "correction request"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setDecision(
                    decision === "approve" ? "request_correction" : "approve",
                  )
                }
              >
                Switch to {decision === "approve" ? "correction" : "approve"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Trash (soft-deleted rows within the 30-day restore window)
// ------------------------------------------------------------------

type TrashRow = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  deletedAt: number;
  purgeAt: number;
  quantity?: number;
  bookingStatus?: string;
  totalAmount: number;
  currency: string;
};

export function AdminTrashDialog({
  open,
  onOpenChange,
  kind,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "registrations" | "bookings";
  onChanged: () => void;
}) {
  const { sessionToken } = useAdminSession();
  const trash = useQuery(
    api.agcAdminData.listAgcTrash,
    open && sessionToken ? { sessionToken } : "skip",
  );
  const restoreReg = useMutation(api.agcAdminData.restoreAgcRegistration);
  const restoreBooking = useMutation(api.agcAdminData.restoreAgcBooking);
  const purge = useMutation(api.agcAdminData.purgeExpiredTrash);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAdmin = useIsAdmin();

  const rows: TrashRow[] = useMemo(() => {
    if (!trash) return [];
    return kind === "registrations" ? trash.registrations : trash.bookings;
  }, [trash, kind]);

  const restore = async (row: TrashRow) => {
    if (!sessionToken) return;
    setBusyId(row._id);
    try {
      if (kind === "registrations") {
        await restoreReg({
          sessionToken,
          registrationId: row._id as Id<"agcRegistrations">,
        });
      } else {
        await restoreBooking({
          sessionToken,
          bookingId: row._id as Id<"agcBookings">,
        });
      }
      toast.success(`Restored ${row.referenceNumber || "record"}`);
      onChanged();
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Restore failed"));
    } finally {
      setBusyId(null);
    }
  };

  const runPurge = async () => {
    if (!sessionToken) return;
    try {
      const result = await purge({ sessionToken });
      toast.success(
        result.purged > 0
          ? `Permanently purged ${result.purged} expired record(s)`
          : "Nothing expired to purge",
      );
      onChanged();
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Purge failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="size-4" /> {kind === "registrations" ? "Registration" : "Booking"} trash
          </DialogTitle>
          <DialogDescription>
            Deleted records restorable for {trash?.ttlDays ?? 30} days, then
            purged automatically. Restoring a trashed booking returns it as
            expired — the hold was released when it was deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Trash is empty.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">
                    {row.referenceNumber || "(pending)"} · {row.hubName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Deleted {new Date(row.deletedAt).toLocaleString()} · purged{" "}
                    {new Date(row.purgeAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row._id}
                  onClick={() => void restore(row)}
                >
                  <RotateCcw className="size-3.5" /> Restore
                </Button>
              </div>
            ))
          )}
        </div>
        {isAdmin && rows.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              <AlertTriangle className="mr-1 inline size-3.5" />
              Purging permanently removes expired records and their receipts.
            </p>
            <Button size="sm" variant="destructive" onClick={() => void runPurge()}>
              <Eraser className="size-3.5" /> Purge expired
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useIsAdmin() {
  const { user } = useAdminSession();
  return user?.role === "admin";
}

// ------------------------------------------------------------------
// Receipt review queue — side-by-side verify with keyboard shortcuts
// ------------------------------------------------------------------

export type QueueItem = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  totalAmount: number;
  currency: string;
  receiptUrl: string | null;
  receiptFileName?: string;
  amountPaid?: number;
  paymentDate?: string;
  paymentMethod?: string;
  offlineRef?: string;
  createdAt: number;
};

/**
 * Side-by-side receipt verification: receipt image on the left, payment
 * details on the right, Approve / Correct / Reject (with message) on the
 * bottom. Keyboard: A approve · C correct · R reject · J next · Esc close.
 * On each decision the queue auto-advances to the next pending item.
 */
export function ReceiptReviewQueue({
  open,
  onOpenChange,
  kind,
  items,
  startIndex = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "registrations" | "bookings";
  items: QueueItem[];
  startIndex?: number;
}) {
  const { sessionToken } = useAdminSession();
  const reviewReg = useMutation(api.agcAdminData.reviewAgcRegistration);
  const reviewBooking = useMutation(api.agcAdminData.reviewAgcBooking);
  const [queue, setQueue] = useState<QueueItem[]>(items);
  const [index, setIndex] = useState(startIndex);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const current = queue[index];
  // Sync the queue when the caller's item list changes (render-time
  // state adjustment — no effect needed).
  const [lastItems, setLastItems] = useState(items);
  if (items !== lastItems) {
    setLastItems(items);
    setQueue(items);
    setIndex(Math.min(startIndex, Math.max(0, items.length - 1)));
  }

  const remaining = queue.length - index;

  const decide = async (
    decision: "approve" | "reject" | "request_correction",
  ) => {
    if (!current || !sessionToken) return;
    if (decision === "request_correction" && !message.trim()) {
      toast.error("A message is required when requesting corrections");
      return;
    }
    setBusy(true);
    try {
      if (kind === "registrations") {
        await reviewReg({
          sessionToken,
          registrationId: current._id as Id<"agcRegistrations">,
          decision,
          message: message || undefined,
        });
      } else {
        await reviewBooking({
          sessionToken,
          bookingId: current._id as Id<"agcBookings">,
          decision,
          message: message || undefined,
        });
      }
      toast.success(
        `${decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Correction requested"} — ${cutQueueLabel(current)}`,
      );
      setMessage("");
      const nextQueue = queue.filter((it) => it._id !== current._id);
      setQueue(nextQueue);
      setIndex(Math.min(index, Math.max(0, nextQueue.length - 1)));
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Review failed"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement) {
        if (event.key === "Escape") (event.target as HTMLTextAreaElement).blur();
        return;
      }
      if (event.key === "a" || event.key === "A") void decide("approve");
      else if (event.key === "c" || event.key === "C")
        void decide("request_correction");
      else if (event.key === "r" || event.key === "R") void decide("reject");
      else if (event.key === "j" || event.key === "J")
        setIndex((i) => Math.min(i + 1, queue.length - 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over latest queue state
  }, [open, queue.length, current, message, sessionToken]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="shrink-0 border-b px-4 py-3">
          <DialogHeader className="gap-1">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>
                Review queue — {current?.referenceNumber || "(pending)"}
              </span>
              <Badge variant="outline" className="tabular-nums">
                {index + 1}/{queue.length} · {remaining} left
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {current?.hubName} · A approve · C correct · R reject · J skip
              · Esc (in message box) leaves typing
            </DialogDescription>
          </DialogHeader>
        </div>
        {current ? (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-2">
            {/* Left: the receipt */}
            <div className="min-h-[280px] rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Receipt
              </p>
              {current.receiptUrl ? (
                <a
                  href={current.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  {/* Receipts are photos or PDFs — img covers the common case,
                      a link backstop covers PDFs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.receiptUrl}
                    alt={`Receipt ${current.receiptFileName ?? ""}`}
                    className="max-h-[52vh] w-full rounded border bg-white object-contain"
                  />
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No receipt attached.
                </p>
              )}
            </div>
            {/* Right: payment claims + mismatch flag */}
            <div className="space-y-3">
              <div className="rounded-lg border p-3 text-sm">
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">System total</dt>
                    <dd className="font-semibold tabular-nums">
                      {current.currency} {current.totalAmount}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Claims paid</dt>
                    <dd
                      className={cn(
                        "font-semibold tabular-nums",
                        amountMismatch(current.amountPaid, current.totalAmount) &&
                          "text-rose-600",
                      )}
                    >
                      {current.currency} {current.amountPaid ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Txn ref</dt>
                    <dd className="font-mono text-xs">{current.offlineRef ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd>{current.paymentDate ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Method</dt>
                    <dd>{current.paymentMethod?.replace(/_/g, " ") ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd>{new Date(current.createdAt).toLocaleString()}</dd>
                  </div>
                </dl>
                {amountMismatch(current.amountPaid, current.totalAmount) && (
                  <p className="mt-2 rounded bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    <AlertTriangle className="mr-1 inline size-3.5" />
                    Amount does not match the system total (
                    {current.amountPaid} vs {current.totalAmount}).
                  </p>
                )}
              </div>
              <Textarea
                rows={2}
                placeholder="Message — required for corrections, optional otherwise"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6">
            <p className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 px-3 py-6 text-center text-sm text-emerald-800">
              Queue clear — every pending receipt in this list has been
              reviewed.
            </p>
          </div>
        )}
        {current && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-3">
            <Button
              disabled={busy}
              onClick={() => void decide("approve")}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Approve (A)
            </Button>
            <Button
              variant="outline"
              disabled={busy || !message.trim()}
              onClick={() => void decide("request_correction")}
              className="border-orange-400 text-orange-700 hover:bg-orange-50"
            >
              Request correction (C)
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void decide("reject")}
            >
              Reject (R)
            </Button>
            <span className="grow" />
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || index >= queue.length - 1}
              onClick={() => setIndex((i) => Math.min(i + 1, queue.length - 1))}
            >
              Next (J) <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function cutQueueLabel(item: QueueItem) {
  return `${item.referenceNumber || "(pending)"} · ${item.hubName}`;
}
