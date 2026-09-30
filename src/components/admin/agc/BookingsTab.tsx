"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { InboxIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  ReviewActions,
  type ReviewDecision,
} from "@/components/admin/agc/AgcAdminClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatTile } from "@/components/portal/StatTile";
import { cn } from "@/lib/utils";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import {
  AGC_ACCOMMODATION_LABELS,
  bookingStatusMeta,
  paymentStatusMeta,
} from "@/lib/agcPortal";
import { hubAvatarClass, hubInitials } from "@/lib/hubRosterView";

type AdminBookingRow = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  currency: string;
  totalAmount: number;
  paymentMode: string;
  paymentStatus: string;
  bookingStatus: string;
  adminMessage: string | null;
  offline: {
    amountPaid: number;
    referenceNumber: string;
    method: string;
    paymentDate: string;
    receiptFileName?: string;
  } | null;
  receiptUrl: string | null;
  expiresAt: number | null;
  guests: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    gender: string;
    title: string;
    accommodationType: string;
    isBishopRate: boolean;
    status: string;
  }>;
};

/** Compact hub avatar chip for the bookings list. */
function HubAvatarSmall({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        hubAvatarClass(name),
      )}
    >
      {hubInitials(name)}
    </span>
  );
}
export function BookingsTab() {
  const { sessionToken } = useAdminSession();
  const bookings = useQuery(
    api.agcAdminData.listAgcBookingsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const review = useMutation(api.agcAdminData.reviewAgcBooking);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "awaiting_review" | "reserved" | "confirmed" | "closed"
  >("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const list = useMemo(() => bookings ?? [], [bookings]);

  const decide = async (
    row: AdminBookingRow,
    decision: ReviewDecision,
    message?: string,
  ) => {
    if (!sessionToken) return;
    setBusyId(row._id);
    try {
      await review({
        sessionToken,
        bookingId: row._id as Id<"agcBookings">,
        decision,
        message,
      });
      toast.success(`Booking ${decision.replace(/_/g, " ")}d`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Review failed"));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((row: AdminBookingRow) => {
      const ok = (() => {
        switch (filter) {
          case "awaiting_review":
            return (
              row.paymentStatus === "pending_verification" ||
              row.paymentStatus === "correction_requested"
            );
          case "reserved":
            return row.bookingStatus === "reserved";
          case "confirmed":
            return row.bookingStatus === "confirmed";
          case "closed":
            return (
              row.bookingStatus === "cancelled" ||
              row.bookingStatus === "expired"
            );
          default:
            return true;
        }
      })();
      if (!ok) return false;
      if (!q) return true;
      return (
        row.referenceNumber.toLowerCase().includes(q) ||
        row.hubName.toLowerCase().includes(q) ||
        row.guests.some((g) =>
          (g.firstName + " " + g.lastName).toLowerCase().includes(q),
        )
      );
    });
  }, [list, filter, search]);

  const summary = useMemo(
    () => ({
      total: list.length,
      awaiting: list.filter(
        (b: AdminBookingRow) =>
          b.paymentStatus === "pending_verification" ||
          b.paymentStatus === "correction_requested",
      ).length,
      reserved: list.filter((b: AdminBookingRow) => b.bookingStatus === "reserved").length,
      confirmed: list.filter((b: AdminBookingRow) => b.bookingStatus === "confirmed").length,
    }),
    [list],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total bookings" value={summary.total} />
        <StatTile
          label="Awaiting review"
          value={summary.awaiting}
          tone={summary.awaiting > 0 ? "warning" : "positive"}
          hint="receipts to approve or correct"
        />
        <StatTile label="On hold (reserved)" value={summary.reserved} tone="info" />
        <StatTile label="Confirmed" value={summary.confirmed} tone="positive" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Reference, hub or guest…"
            className="h-9 w-64 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "awaiting_review", "reserved", "confirmed", "closed"] as const).map((id) => {
            const labels = { all: "All", awaiting_review: "Awaiting review", reserved: "On hold", confirmed: "Confirmed", closed: "Closed" } as const;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === id
                    ? "border-gold bg-gold/15 text-ink"
                    : "text-muted-foreground hover:border-gold/40 hover:text-foreground",
                )}
              >
                {labels[id]}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-gold/15">
            <InboxIcon className="size-5 text-gold-dark" />
          </span>
          <p className="text-sm font-medium">No bookings match</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {search || filter !== "all"
              ? "Try a different search or filter chip."
              : "Rep bookings will appear here as they are made."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row: AdminBookingRow) => {
            const status = bookingStatusMeta(row.bookingStatus);
            const payStatus = paymentStatusMeta(row.paymentStatus);
            const expanded = expandedId === row._id;
            const activeGuests = row.guests.filter((g) => g.status === "active");
            return (
              <div
                key={row._id}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  row.paymentStatus === "pending_verification" && "border-l-4 border-l-amber-400",
                )}
              >
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 text-left"
                  onClick={() => setExpandedId(expanded ? null : row._id)}
                >
                  <HubAvatarSmall name={row.hubName} />
                  <span className="font-mono text-xs">{row.referenceNumber || "(pending)"}</span>
                  <Badge variant="outline" className={status.className}>{status.label}</Badge>
                  <Badge variant="outline" className={payStatus.className}>{payStatus.label}</Badge>
                  <span className="text-sm font-medium">{row.hubName}</span>
                  <span className="text-sm text-muted-foreground">
                    {row.currency} {row.totalAmount} · {activeGuests.length} guest(s) · {row.paymentMode}
                  </span>
                </button>
                {expanded && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <div className="space-y-1 text-xs">
                      {row.guests.map((guest) => (
                        <p key={guest._id}>
                          {guest.title} {guest.firstName} {guest.lastName} ·{" "}
                          {guest.gender} ·{" "}
                          {AGC_ACCOMMODATION_LABELS[guest.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS] ?? guest.accommodationType}
                          {guest.isBishopRate ? " · Bishop rate" : ""}
                          {guest.status !== "active" ? ` · ${guest.status}` : ""}
                        </p>
                      ))}
                    </div>
                    {row.offline && (
                      <div className="rounded-lg bg-muted/50 p-3 text-sm">
                        <p>
                          Amount paid: <strong>{row.currency} {row.offline.amountPaid}</strong>{" "}
                          · {row.offline.method.replace(/_/g, " ")} · {row.offline.paymentDate}{" "}
                          · ref {row.offline.referenceNumber}
                        </p>
                        {row.receiptUrl && (
                          <a
                            href={row.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-primary hover:underline"
                          >
                            View receipt ({row.offline.receiptFileName})
                          </a>
                        )}
                      </div>
                    )}
                    {row.adminMessage && (
                      <p className="rounded bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-300">
                        Last message: {row.adminMessage}
                      </p>
                    )}
                    {row.expiresAt && row.bookingStatus === "reserved" && (
                      <p className="text-xs text-muted-foreground">
                        Hold expires {new Date(row.expiresAt).toLocaleString()}
                      </p>
                    )}
                    {row.paymentStatus === "pending_verification" && (
                      <ReviewActions
                        disabled={busyId === row._id}
                        onDecision={(decision, message) =>
                          void decide(row, decision, message)
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
