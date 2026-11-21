"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eraser, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { EmptyState } from "@/components/admin/kit/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";

type TrashRow = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  deletedAt: number;
  purgeAt: number;
  kind: "registration" | "booking";
};

/**
 * Soft-deleted registrations and bookings, restorable for the trash window.
 * Restore one, or (admins) permanently purge the ones past the window — there
 * is no scheduled purge, so nothing leaves the trash unless someone asks.
 */
export function TrashPanel() {
  const { sessionToken, user } = useAdminSession();
  const trash = useQuery(
    api.agcAdminData.listAgcTrash,
    sessionToken ? { sessionToken } : "skip",
  );
  const restoreReg = useMutation(api.agcAdminData.restoreAgcRegistration);
  const restoreBooking = useMutation(api.agcAdminData.restoreAgcBooking);
  const purge = useMutation(api.agcAdminData.purgeExpiredTrash);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [purging, setPurging] = useState(false);
  const isAdmin = user?.role === "admin";
  // Read once per mount — the restore window is measured in days.
  const [now] = useState(() => Date.now());

  const rows: TrashRow[] = trash
    ? [
        ...trash.registrations.map((row) => ({ ...row, kind: "registration" as const })),
        ...trash.bookings.map((row) => ({ ...row, kind: "booking" as const })),
      ].sort((a, b) => b.deletedAt - a.deletedAt)
    : [];
  const expired = rows.filter((row) => row.purgeAt <= now).length;

  const restore = async (row: TrashRow) => {
    if (!sessionToken) return;
    setBusyId(row._id);
    try {
      if (row.kind === "registration") {
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
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Restore failed"));
    } finally {
      setBusyId(null);
    }
  };

  const runPurge = async () => {
    if (!sessionToken) return;
    setPurging(true);
    try {
      const result = await purge({ sessionToken });
      toast.success(
        result.purged > 0
          ? `Permanently removed ${result.purged} expired record(s)`
          : "Nothing expired to remove",
      );
      setConfirming(false);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Purge failed"));
    } finally {
      setPurging(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">Trash</CardTitle>
          <p className="text-xs text-muted-foreground">
            Deleted registrations and bookings, restorable for{" "}
            {trash?.ttlDays ?? 30} days. A restored booking comes back as
            expired.
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            disabled={expired === 0}
            onClick={() => setConfirming(true)}
          >
            <Eraser className="size-4" />
            Purge expired ({expired})
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {trash === undefined ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Trash2} title="Trash is empty" />
        ) : (
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {rows.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm">
                    <span className="font-mono text-xs">
                      {row.referenceNumber || "(pending)"}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {row.hubName}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {row.kind}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Deleted {new Date(row.deletedAt).toLocaleDateString()} ·{" "}
                    {row.purgeAt <= now
                      ? "past the restore window"
                      : `restorable until ${new Date(row.purgeAt).toLocaleDateString()}`}
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Permanently remove ${expired} expired record${expired === 1 ? "" : "s"}?`}
        description="Records past the restore window are deleted for good, with their receipts. This cannot be undone."
        confirmLabel={`Remove ${expired}`}
        loading={purging}
        onConfirm={runPurge}
      />
    </Card>
  );
}
