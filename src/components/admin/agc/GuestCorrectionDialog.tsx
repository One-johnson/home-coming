"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2Icon, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";

/**
 * Correct a delegate's name and gender on a booking — super admin only.
 *
 * A rep can only substitute while the booking is still theirs to change, so a
 * reservation whose delegate was swapped at the desk, or whose gender was
 * recorded in error, can only be put right here. The old values go into the
 * substitution history rather than disappearing, a reason is required, and the
 * accommodation type is never touched (§43). A gender change is refused while
 * the delegate sits in a room it would make invalid, so the rooming rules the
 * bed was allocated under still hold.
 */

export type CorrectableGuest = {
  _id: string;
  firstName: string;
  lastName: string;
  gender: string;
  title: string;
  status: string;
};

export function GuestCorrectionDialog({
  guest,
  sessionToken,
  onClose,
}: {
  /** The delegate being corrected, or null when the dialog is closed. */
  guest: CorrectableGuest | null;
  sessionToken: string | null;
  onClose: () => void;
}) {
  const correctGuest = useMutation(api.agcAdminData.correctBookingGuest);
  // Seeded once per delegate: the caller keys this dialog on the delegate, so
  // opening it for another one remounts with that delegate's details.
  const [title, setTitle] = useState(guest?.title ?? "");
  const [firstName, setFirstName] = useState(guest?.firstName ?? "");
  const [lastName, setLastName] = useState(guest?.lastName ?? "");
  const [gender, setGender] = useState<"male" | "female">(
    guest?.gender === "female" ? "female" : "male",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const nameChanged =
    !!guest &&
    (firstName.trim() !== guest.firstName || lastName.trim() !== guest.lastName);
  const genderChanged = !!guest && gender !== guest.gender;
  const changed = nameChanged || genderChanged;
  const canSave =
    !!sessionToken &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    changed &&
    reason.trim().length > 0;

  const doCorrect = async () => {
    if (!sessionToken || !guest || !canSave) return;
    setBusy(true);
    try {
      await correctGuest({
        sessionToken,
        guestId: guest._id as Id<"agcGuests">,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        title: title.trim() || undefined,
        gender,
        reason: reason.trim(),
      });
      toast.success(
        `Corrected ${guest.firstName} ${guest.lastName} on the booking.`,
        {
          description:
            "The previous details are kept in the substitution history and the audit log.",
        },
      );
      onClose();
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Could not correct the delegate"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={guest !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct delegate details</DialogTitle>
          <DialogDescription>
            {guest
              ? `${guest.title} ${guest.firstName} ${guest.lastName} — a super admin correction on a live reservation.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Member"
              />
            </div>
            <div className="space-y-1.5">
              <Label>First name</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Last name</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select
              value={gender}
              onValueChange={(value) => setGender(value as "male" | "female")}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
            {genderChanged && (
              <p className="text-xs text-muted-foreground">
                A gender change is checked against the delegate&apos;s current room —
                a bed in a single-gender room has to be vacated first.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea
              rows={2}
              placeholder="e.g. original delegate could not travel; substituted on arrival…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            The accommodation type and the beds held stay as they are, and the
            details being replaced are kept in the substitution history.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canSave || busy} onClick={() => void doCorrect()}>
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
              Save correction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
