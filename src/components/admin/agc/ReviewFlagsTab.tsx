"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BedDouble,
  CircleCheck,
  Flag,
  HandCoins,
  Loader2Icon,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  GuestCorrectionDialog,
  type CorrectableGuest,
} from "@/components/admin/agc/GuestCorrectionDialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { TONE_RAIL, TONE_SURFACE } from "@/lib/agcStatusTone";

/**
 * Review flags — the desk's "flag this record for review" queue in one list.
 *
 * The desk raises a flag with a note when something does not add up; this is
 * where the Accommodation Admin works through them. Each row carries the note,
 * who raised it, and the delegate's record (room, hub, payment, check-in
 * state), so a decision can be made without opening the arrival desk.
 *
 * The reviewer acts from the dialog, not from another screen: a delegate with
 * no bed can be given one out of the rooms that fit them, a record the desk
 * could not check in for want of a confirmed payment can have that §18 override
 * pre-authorized here — which is what lets the desk finish the arrival without
 * an approver standing at the counter — and a name or gender that is simply
 * wrong on the record can be corrected, since a delegate who arrives as
 * somebody else is exactly the kind of thing the desk flags. Clearing the flag
 * asks for the review outcome, and the flag keeps both notes.
 */

type FlagRow = {
  _id: string;
  note: string;
  raisedAt: number;
  raisedBy: string;
  raisedByRole: string | null;
  guestId: string;
  guestName: string;
  /** Parts of the name — empty when the delegate is no longer on file. */
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  hubName: string;
  accommodationType: string;
  bookingRef: string;
  paymentStatus: string;
  poaStatus: string | null;
  roomName: string | null;
  building: string | null;
  checkInStatus: "checked_in" | "checked_out" | "not_arrived";
  assignmentStatus: "assigned" | "unassigned";
  roomable: boolean;
  bookingLive: boolean;
  paymentOverride: {
    authorizedBy: string;
    reason: string;
    authorizedAt: number;
  } | null;
};

type RoomRow = {
  _id: string;
  accommodationType: string;
  name: string;
  building: string | null;
  gender: string | null;
  capacity: number;
  occupants: number;
  /** Reserved or faulty rooms are not offered from the queue either. */
  hold?: { note: string } | null;
  faulty?: boolean;
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

function roomLabel(row: FlagRow): string {
  return row.roomName
    ? [row.roomName, row.building].filter(Boolean).join(" · ")
    : "No room yet";
}

export function ReviewFlagsTab() {
  const { sessionToken } = useAdminSession();
  // No role branch on the correction below: this tab is the accommodation area
  // and the server's approver check, so everyone who can open it is admin or
  // Accommodation Admin — and both hold the power, as on the desk and the
  // bookings list. Ordinary desk staff raise the flag instead.
  const flags = useQuery(
    api.agcCheckin.listReviewFlags,
    sessionToken ? { sessionToken } : "skip",
  );
  const resolveFlag = useMutation(api.agcCheckin.resolveCheckinFlag);
  const authorizeOverride = useMutation(
    api.agcCheckin.authorizeCheckinOverride,
  );
  const assignGuests = useMutation(api.agcRoomAssignments.assignGuests);

  const [target, setTarget] = useState<FlagRow | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCleared, setShowCleared] = useState(false);
  /** Ids cleared in this session — the rows drop off the queue immediately. */
  const [cleared, setCleared] = useState<string[]>([]);
  const clearedIds = useMemo(() => new Set(cleared), [cleared]);

  /** The record being reviewed, re-read from the live queue as it changes. */
  const rows = (flags ?? []).filter((row) => !clearedIds.has(row._id));
  const targetRow = target
    ? rows.find((row) => row._id === target._id) ?? target
    : null;

  // Rooms are only needed while a reviewer is giving a delegate a bed.
  const needsRoom =
    !!targetRow && targetRow.assignmentStatus === "unassigned" && targetRow.roomable;
  const allRooms = useQuery(
    api.agcRoomAssignments.listRoomsAdmin,
    sessionToken && needsRoom ? { sessionToken } : "skip",
  );
  const roomOptions =
    needsRoom && targetRow
      ? ((allRooms ?? []) as RoomRow[])
          .filter(
            (room) =>
              !room.faulty &&
              !room.hold &&
              room.accommodationType === targetRow.accommodationType &&
              room.capacity - room.occupants > 0 &&
              // A gender-locked room only takes its own gender; the server still
              // owns the single-gender rule for shared dormitories and hostels.
              (!room.gender || room.gender === targetRow.gender),
          )
          .map((room) => ({
            _id: room._id,
            label: `${room.name}${room.building ? ` · ${room.building}` : ""} · ${
              room.capacity - room.occupants
            } free`,
          }))
      : [];

  const [guestCorrectTarget, setGuestCorrectTarget] =
    useState<CorrectableGuest | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [roomBusy, setRoomBusy] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);

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

  const doAssignRoom = async () => {
    if (!sessionToken || !targetRow || !roomId) return;
    setRoomBusy(true);
    try {
      await assignGuests({
        sessionToken,
        roomId: roomId as Id<"agcRooms">,
        guestIds: [targetRow.guestId as Id<"agcGuests">],
      });
      toast.success(`${targetRow.guestName} now has a bed.`);
      setRoomId("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not assign the room"));
    } finally {
      setRoomBusy(false);
    }
  };

  const doAuthorizeOverride = async () => {
    if (!sessionToken || !targetRow) return;
    setOverrideBusy(true);
    try {
      await authorizeOverride({
        sessionToken,
        flagId: targetRow._id as Id<"agcCheckinFlags">,
        reason: overrideReason.trim(),
      });
      toast.success(
        `Payment override authorized — the desk can check ${targetRow.guestName} in now.`,
      );
      setOverrideReason("");
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Could not authorize the override"),
      );
    } finally {
      setOverrideBusy(false);
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
                      {roomLabel(row)}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {paymentLabel(row)}
                      {row.paymentOverride && (
                        <span className="mt-0.5 block text-xs text-emerald-700 dark:text-emerald-400">
                          Override authorized
                        </span>
                      )}
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
                          setRoomId("");
                          setOverrideReason("");
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review — {targetRow?.guestName}</DialogTitle>
            <DialogDescription>
              Raised by {targetRow ? raiserLabel(targetRow) : ""}: “
              {targetRow?.note}”
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <dl className="space-y-1 rounded-lg border px-3 py-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Room:</dt>
                <dd className="font-medium">
                  {targetRow ? roomLabel(targetRow) : ""}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Payment:</dt>
                <dd className="font-medium">
                  {targetRow ? paymentLabel(targetRow) : ""}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Check-in:</dt>
                <dd className="font-medium">
                  {targetRow ? CHECK_IN_LABEL[targetRow.checkInStatus] : ""}
                </dd>
              </div>
            </dl>

            {/* Act on the record — the decision usually needs a bed or an
                override, and neither should mean leaving this list. */}
            <div
              className={cn(
                "space-y-2 rounded-lg border border-l-4 p-3",
                TONE_SURFACE.neutral,
                TONE_RAIL.neutral,
              )}
            >
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <BedDouble className="size-4 shrink-0" />
                Room
              </p>
              {targetRow?.assignmentStatus === "assigned" ? (
                <p className="text-xs text-muted-foreground">
                  Already roomed in {roomLabel(targetRow)}. Moving a delegate is a
                  room change with its own reason on the Rooms tab — this queue only
                  beds delegates who have none.
                </p>
              ) : needsRoom ? (
                <>
                  <Select
                    value={roomId}
                    onValueChange={(value) => setRoomId(value ?? "")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Pick a room with a free bed…" />
                    </SelectTrigger>
                    <SelectContent>
                      {roomOptions.map((room) => (
                        <SelectItem key={room._id} value={room._id}>
                          {room.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {roomOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No {targetRow.accommodationType.replace(/_/g, " ")} room has a
                      free bed for a {targetRow.gender} delegate right now.
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      disabled={!roomId || roomBusy}
                      onClick={() => void doAssignRoom()}
                    >
                      {roomBusy ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <BedDouble className="size-4" />
                      )}
                      Assign room
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {targetRow?.bookingLive
                    ? "This booking is not confirmed (or on payment-on-arrival terms), so no bed can be assigned yet. Confirm the payment on the Bookings tab first."
                    : "This booking no longer stands, so there is nothing to room."}
                </p>
              )}
            </div>

            <div
              className={cn(
                "space-y-2 rounded-lg border border-l-4 p-3",
                targetRow?.paymentOverride
                  ? TONE_SURFACE.done
                  : TONE_SURFACE.neutral,
                targetRow?.paymentOverride ? TONE_RAIL.done : TONE_RAIL.neutral,
              )}
            >
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <HandCoins className="size-4 shrink-0" />
                Payment override (§18)
              </p>
              {targetRow?.paymentOverride ? (
                <>
                  <p className="text-xs text-foreground/80">
                    {targetRow.paymentOverride.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Authorized by {targetRow.paymentOverride.authorizedBy} ·{" "}
                    {new Date(
                      targetRow.paymentOverride.authorizedAt,
                    ).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The desk can check this delegate in on these terms; the arrival
                    records you as the authorizer.
                  </p>
                </>
              ) : !targetRow?.bookingLive ? (
                <p className="text-xs text-muted-foreground">
                  This booking no longer stands — no override is needed.
                </p>
              ) : targetRow.roomable ? (
                <p className="text-xs text-muted-foreground">
                  This delegate&apos;s payment is in order, so the desk can check them
                  in without an override.
                </p>
              ) : (
                <>
                  <Label>Reason for the override (required)</Label>
                  <Textarea
                    rows={2}
                    placeholder="e.g. receipt verified at the desk against the transfer…"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={!overrideReason.trim() || overrideBusy}
                    onClick={() => void doAuthorizeOverride()}
                  >
                    {overrideBusy ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <HandCoins className="size-4" />
                    )}
                    Authorize override
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Authorizing does not confirm the payment — it lets the desk finish
                    the arrival and records who authorized it and why.
                  </p>
                </>
              )}
            </div>

            <div
              className={cn(
                "space-y-2 rounded-lg border border-l-4 p-3",
                TONE_SURFACE.neutral,
                TONE_RAIL.neutral,
              )}
            >
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Pencil className="size-4 shrink-0" />
                Delegate details
              </p>
              <p className="text-xs text-foreground/80">
                {targetRow?.firstName
                  ? `${targetRow.title} ${targetRow.firstName} ${targetRow.lastName} · ${targetRow.gender}`
                  : "The delegate is no longer on file."}
              </p>
              {!targetRow?.firstName ? null : !targetRow.bookingLive ? (
                <p className="text-xs text-muted-foreground">
                  This booking no longer stands, so there is nothing to correct.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!sessionToken}
                  onClick={() =>
                    setGuestCorrectTarget({
                      _id: targetRow.guestId,
                      title: targetRow.title,
                      firstName: targetRow.firstName,
                      lastName: targetRow.lastName,
                      gender: targetRow.gender,
                      status: "active",
                    })
                  }
                >
                  <Pencil className="size-4" /> Correct name / gender
                </Button>
              )}
              {targetRow?.firstName && targetRow.bookingLive ? (
                <p className="text-xs text-muted-foreground">
                  The correction is saved against the booking with its reason, and the
                  desk reads the corrected record straight afterwards. The flag stays
                  open until you clear it here.
                </p>
              ) : null}
            </div>

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

      {/* Correcting the record is a second dialog, so the reviewer can fix the
          name the desk flagged without losing the review they are part-way
          through. Keyed per delegate, so it opens with the right details. */}
      <GuestCorrectionDialog
        key={guestCorrectTarget?._id ?? "none"}
        guest={guestCorrectTarget}
        sessionToken={sessionToken}
        onClose={() => setGuestCorrectTarget(null)}
      />
    </div>
  );
}
