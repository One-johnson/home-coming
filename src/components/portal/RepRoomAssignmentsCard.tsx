"use client";

import { useQuery } from "convex/react";
import { BedDouble, KeyRound, UsersIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

/**
 * Phase 2 §8 — published room assignments. Only rooms an Accommodation Admin
 * has published appear, and only this rep's own delegates are listed; other
 * hubs' rooming details are never visible here.
 */

/** Arrival day, taken from the event config instead of a typed-in date. */
const CHECK_IN_LABEL = new Date(`${EVENT.checkInDate}T12:00:00Z`).toLocaleDateString(
  "en-US",
  { day: "numeric", month: "short" },
);

export type RepRoom = {
  roomId: string;
  name: string;
  building: string | null;
  accommodationType: string;
  typeLabel: string;
  capacity: number;
  occupants: {
    guestId: string;
    name: string;
    gender: string;
    bookingRef: string;
    checkedIn: boolean;
  }[];
};

/** A tint per room type so the grid can be scanned without reading labels. */
const TYPE_ACCENTS: Record<string, { chip: string; bar: string }> = {
  dormitory: {
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    bar: "bg-indigo-400",
  },
  hostel: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    bar: "bg-sky-400",
  },
  wise_serpents: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    bar: "bg-violet-400",
  },
  good_general: {
    chip: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
    bar: "bg-teal-400",
  },
  ebpv: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    bar: "bg-amber-400",
  },
};

const FALLBACK_ACCENT = {
  chip: "bg-gold/15 text-gold-dark",
  bar: "bg-gold",
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

/** The grid itself: 1 column on phones, 3 on desktop, 4 on very wide screens. */
export function RepRoomAssignmentsGrid({ rooms }: { rooms: RepRoom[] }) {
  const beds = rooms.reduce((sum, room) => sum + room.capacity, 0);
  const placed = rooms.reduce((sum, room) => sum + room.occupants.length, 0);
  const checkedIn = rooms.reduce(
    (sum, room) => sum + room.occupants.filter((guest) => guest.checkedIn).length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded-full border bg-muted/40 px-2 py-1 tabular-nums">
          {rooms.length} room{rooms.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border bg-muted/40 px-2 py-1 tabular-nums">
          {placed} of {beds} beds
        </span>
        {checkedIn > 0 && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 tabular-nums text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            {checkedIn} checked in
          </span>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {rooms.map((room) => {
          const accent = TYPE_ACCENTS[room.accommodationType] ?? FALLBACK_ACCENT;
          const typeLabel =
            AGC_ACCOMMODATION_LABELS[
              room.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS
            ] ?? room.typeLabel;
          const roomCheckedIn = room.occupants.filter((guest) => guest.checkedIn).length;
          const freeBeds = Math.max(0, room.capacity - room.occupants.length);

          return (
            <li
              key={room.roomId}
              className="flex flex-col overflow-hidden rounded-xl border bg-card ring-1 ring-foreground/5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-2.5 border-b bg-muted/30 px-3 py-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    accent.chip,
                  )}
                >
                  <BedDouble className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{room.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {typeLabel}
                    {room.building ? ` · ${room.building}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border bg-card px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {room.occupants.length}/{room.capacity}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2.5 p-3">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <UsersIcon className="size-3" />
                    {room.occupants.length === 0
                      ? "Empty"
                      : `${room.occupants.length} delegate${room.occupants.length === 1 ? "" : "s"}`}
                  </span>
                  <span
                    className={cn(
                      roomCheckedIn > 0 &&
                        "font-medium text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {roomCheckedIn > 0
                      ? `${roomCheckedIn} checked in`
                      : room.occupants.length > 0
                        ? `Arrives ${CHECK_IN_LABEL}`
                        : `${freeBeds} free`}
                  </span>
                </div>

                {/* One segment per bed: filled by placement, tinted by type. */}
                <div className="flex gap-1" aria-hidden>
                  {Array.from({ length: Math.max(room.capacity, 1) }).map(
                    (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "h-1.5 flex-1 rounded-full",
                          index < room.occupants.length ? accent.bar : "bg-muted",
                        )}
                      />
                    ),
                  )}
                </div>

                {room.occupants.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-2 py-4 text-center text-[11px] text-muted-foreground">
                    No delegates placed here yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {room.occupants.map((occupant) => (
                      <li
                        key={occupant.guestId}
                        className="flex items-center gap-2 rounded-lg bg-muted/40 px-2 py-1.5"
                      >
                        <span
                          aria-hidden
                          className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-card text-[10px] font-semibold"
                        >
                          {initials(occupant.name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {occupant.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {occupant.gender}
                          </span>
                        </span>
                        {occupant.checkedIn ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-emerald-300 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            Checked in
                          </Badge>
                        ) : (
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {occupant.bookingRef}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {room.accommodationType === "ebpv" && room.occupants.length > 0 && (
                  <p className="mt-auto flex items-start gap-1 text-[10px] leading-relaxed text-muted-foreground">
                    <KeyRound className="mt-0.5 size-3 shrink-0" />
                    Keys go to the first delegate who checks in (capacity 4;
                    rooms are chosen by the occupants).
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RepRoomAssignmentsCard() {
  const { sessionToken } = useRepSession();
  const rooms = useQuery(
    api.agcRoomAssignments.getRepRoomAssignments,
    sessionToken ? { sessionToken } : "skip",
  ) as RepRoom[] | undefined;

  if (rooms === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BedDouble className="size-4 text-gold-dark" /> Room assignments
          </CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (rooms.length === 0) {
    // §8: delegates are told their room when they arrive — nothing is shown
    // until the accommodation admin publishes, so this card is quiet.
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BedDouble className="size-4 text-gold-dark" /> Room assignments
          <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
            Published
          </Badge>
        </CardTitle>
        <CardDescription>
          Your hub&apos;s published accommodation. Delegates confirm their rooms
          on arrival day.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RepRoomAssignmentsGrid rooms={rooms} />
      </CardContent>
    </Card>
  );
}
