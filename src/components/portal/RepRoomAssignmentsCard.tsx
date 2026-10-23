"use client";

import { useQuery } from "convex/react";
import { BedDouble, KeyRound } from "lucide-react";
import { api } from "@convex/_generated/api";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import { EVENT } from "@/lib/eventConfig";

/** Arrival day, taken from the event config instead of a typed-in date. */
const CHECK_IN_LABEL = new Date(`${EVENT.checkInDate}T12:00:00Z`).toLocaleDateString(
  "en-US",
  { day: "numeric", month: "short" },
);

/**
 * Phase 2 §8 — published room assignments. Only rooms an Accommodation Admin
 * has published appear, and only this rep's own delegates are listed; other
 * hubs' rooming details are never visible here.
 */

type RepRoom = {
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

export function RepRoomAssignmentsCard() {
  const { sessionToken } = useRepSession();
  const rooms = useQuery(
    api.agcRoomAssignments.getRepRoomAssignments,
    sessionToken ? { sessionToken } : "skip",
  );

  if (rooms === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BedDouble className="size-4 text-gold-dark" /> Room assignments
          </CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16" />
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
          Your hub&apos;s published accommodation. Delegates will confirm their
          rooms on arrival day.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {rooms.map((room: RepRoom) => (
          <div key={room.roomId} className="rounded-xl border p-3">
            <p className="text-sm font-medium">
              {room.name}
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                · {AGC_ACCOMMODATION_LABELS[room.accommodationType as keyof typeof AGC_ACCOMMODATION_LABELS] ?? room.typeLabel}
                {room.building ? ` · ${room.building}` : ""}
              </span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {room.occupants.map((occupant) => (
                <li key={occupant.guestId} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    {occupant.name}
                    <span className="text-muted-foreground">
                      {" "}({occupant.gender})
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {occupant.checkedIn ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                        Checked in
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        Arrives {CHECK_IN_LABEL}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {room.accommodationType === "ebpv" && room.occupants.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <KeyRound className="size-3" />
                Apartment keys go to the first delegate who checks in (capacity
                4; rooms are chosen by the occupants).
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
