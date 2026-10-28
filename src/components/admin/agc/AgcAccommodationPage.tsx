"use client";

import { useState } from "react";
import { BedDouble, Boxes, ClipboardList, Flag, HandCoins } from "lucide-react";
import { BookingsTab } from "@/components/admin/agc/BookingsTab";
import { PoolsTab } from "@/components/admin/agc/PoolsTab";
import { PoaTab } from "@/components/admin/agc/PoaTab";
import { ReviewFlagsTab } from "@/components/admin/agc/ReviewFlagsTab";
import { RoomsTab } from "@/components/admin/agc/RoomsTab";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { cn } from "@/lib/utils";

type AccommodationSection = "bookings" | "poa" | "pools" | "rooms" | "flags";

const SECTIONS: Array<{
  id: AccommodationSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "bookings", label: "Bookings", icon: ClipboardList },
  { id: "poa", label: "Payment on arrival", icon: HandCoins },
  { id: "pools", label: "Pools", icon: Boxes },
  { id: "rooms", label: "Rooms", icon: BedDouble },
  { id: "flags", label: "Review flags", icon: Flag },
];

/** Accommodation page content: bookings review + capacity pools. */
export function AgcAccommodationPage({
  initialSection = "bookings",
}: {
  /** Deep link support — e.g. /admin/accommodation?tab=poa opens the POA tab. */
  initialSection?: AccommodationSection;
} = {}) {
  const { user } = useAdminSession();
  const [section, setSection] = useState<AccommodationSection>(initialSection);
  // The POA booking queue is for admin + finance; accommodation staff get the
  // standard tabs only (matches the registration page's role gating).
  const showPoa = user?.role === "admin" || user?.role === "finance";
  // Room-assignment staff run the inventory, not the money: rooms and review
  // flags only. Bookings review, pools and POA stay with the finance side.
  const roomTeamOnly = user?.role === "room_assignment";
  const allowed = (id: AccommodationSection) => {
    if (id === "poa" && !showPoa) return false;
    if (roomTeamOnly) return id === "rooms" || id === "flags";
    return true;
  };
  const activeSection = allowed(section) ? section : "rooms";

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Accommodation sections"
        className="flex w-fit items-center gap-1 rounded-full border p-1"
      >
        {SECTIONS.filter(({ id }) => allowed(id)).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeSection === id}
            onClick={() => setSection(id)}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
              activeSection === id
                ? "bg-gold/15 text-ink"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {activeSection === "bookings" ? (
        <BookingsTab />
      ) : activeSection === "poa" ? (
        <PoaTab kind="booking" />
      ) : activeSection === "pools" ? (
        <PoolsTab />
      ) : activeSection === "rooms" ? (
        <RoomsTab />
      ) : (
        <ReviewFlagsTab />
      )}
    </div>
  );
}
