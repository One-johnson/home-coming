"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CircleCheck, Flag, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import { ROLE_LABELS } from "@/lib/adminRoles";
import { cn } from "@/lib/utils";

/**
 * Review flags — the desk's "flag this record for review" queue in one list.
 *
 * The desk raises a flag with a note when something does not add up; this is
 * where the Accommodation Admin works through them. Each row carries the note,
 * who raised it, and the delegate's record (room, hub, payment, check-in
 * state), so a decision can be made without opening the arrival desk. Clearing
 * a flag asks for the review outcome, and the flag keeps both notes.
 */

type FlagRow = {
  _id: string;
  note: string;
  raisedAt: number;
  raisedBy: string;
  raisedByRole: string | null;
  guestId: string;
  guestName: string;
  gender: string;
  hubName: string;
  accommodationType: string;
  bookingRef: string;
  paymentStatus: string;
  poaStatus: string | null;
  roomName: string | null;
  building: string | null;
  checkInStatus: "checked_in" | "checked_out" | "not_arrived";
};

const CHECK_IN_LABEL: Record<FlagRow["checkInStatus"], string> = {
  checked_in: "Checked in",
  checked_out: "Checked out",
  not_arrived: "Not arrived",
};

/** Payment as the reviewer reads it: confirmed, on POA terms, or still open. */
function paymentLabel(row: FlagRow): string {
  if (row.paymentStatus === "confirmed") return "Paid";
  if (row.poaStatus === "confirmed") return "Paid on arrival";
  return row.paymentStatus
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function raiserLabel(row: FlagRow): string {
  const role = row.raisedByRole
    ? ROLE_LABELS[row.raisedByRole as keyof typeof ROLE_LABELS] ?? row.raisedByRole
    : null;
  return role ? `${row.raisedBy} · ${role}` : row.raisedBy;
}

export function ReviewFlagsTab() {
  const { sessionToken } = useAdminSession();
  const flags = useQuery(
    api.agcCheckin.listReviewFlags,
    sessionToken ? { sessionToken } : "skip",
  );
  const resolveFlag = useMutation(api.agcCheckin.resolveCheckinFlag);

  const [target, setTarget] = useState<FlagRow | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCleared, setShowCleared] = useState(false);

  /** Ids cleared in this session — the rows drop off the queue immediately. */
  const [cleared, setCleared] = useState<string[]>([]);

  const rows = (flags ?? []).filter((row) => !cleared.includes(row._id));

  const doResolve = async () => {
    if (!sessionToken || !target) return;
    setBusy(true);
    try {
      await resolveFlag({
        sessionToken,
        flagId: target._id as Id<"agcCheckinFlags">,
        resolutionNote: resolutionNote.trim(),
      });
      setCleared((prev) => [...prev, target._id]);
      toast.success(`Cleared the flag on ${target.guestName}.`);
      setTarget(null);
      setResolutionNote("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not clear the flag"));
    } finally {
      setBusy(false);
    }
  };

  if (flags === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-l-4 px-3 py-1.5 text-sm font-medium",
            rows.length > 0
              ? "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"
              : "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200",
          )}
        >
          <Flag className="size-4 shrink-0" />
          {rows.length > 0
            ? `${rows.length} record${rows.length === 1 ? "" : "s"} waiting on a review decision`
            : "No records are waiting on a review"}
        </span>
        {cleared.length > 0 && (
          <Button
            variant="link"
            className="h-8 px-1 text-xs font-medium"
            onClick={() => setShowCleared((value) => !value)}
          >
            {showCleared
              ? "Hide what I cleared"
              : `Show what I cleared (${cleared.length})`}
          </Button>
        )}
      </div>

      {showCleared && cleared.length > 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          You cleared {cleared.length} flag{cleared.length === 1 ? "" : "s"} in this
          session. Each one keeps both notes — what the desk raised and your outcome
          — and the audit entry.
        </p>
      )}

      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Delegate</TableHead>
                <TableHead className="hidden sm:table-cell">Room</TableHead>
                <TableHead className="hidden md:table-cell">Payment</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>What the desk flagged</TableHead>
                <TableHead className="hidden lg:table-cell">Raised by</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Nothing to review — a flag raised at the arrival desk appears
                    here until it is cleared.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>
                      <span className="font-semibold">{row.guestName}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        <span className="capitalize">{row.gender}</span>
                        {" · "}Hub {row.hubName}
                        {row.bookingRef ? ` · Ref ${row.bookingRef}` : ""}
                        {row.accommodationType
                          ? ` · ${
                              AGC_ACCOMMODATION_LABELS[
                                row.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
                              ] ?? row.accommodationType
                            }`
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {row.roomName
                        ? [row.roomName, row.building].filter(Boolean).join(" · ")
                        : "No room yet"}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {paymentLabel(row)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {CHECK_IN_LABEL[row.checkInStatus]}
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-sm">
                      {row.note}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {raiserLabel(row)}
                      <span className="mt-0.5 block">
                        {new Date(row.raisedAt).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTarget(row);
                          setResolutionNote("");
                        }}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review — {target?.guestName}</DialogTitle>
            <DialogDescription>
              Raised by {target ? raiserLabel(target) : ""}: “{target?.note}”
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <dl className="space-y-1 rounded-lg border px-3 py-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Room:</dt>
                <dd className="font-medium">
                  {target?.roomName
                    ? [target.roomName, target.building].filter(Boolean).join(" · ")
                    : "No room yet"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Payment:</dt>
                <dd className="font-medium">{target ? paymentLabel(target) : ""}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Check-in:</dt>
                <dd className="font-medium">
                  {target ? CHECK_IN_LABEL[target.checkInStatus] : ""}
                </dd>
              </div>
            </dl>
            <div className="space-y-1.5">
              <Label>Review outcome (required)</Label>
              <Textarea
                rows={3}
                placeholder="e.g. payment verified against the transfer, no further action…"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={!resolutionNote.trim() || busy}
                onClick={() => void doResolve()}
              >
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <CircleCheck className="size-4" />
                )}
                Clear flag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
