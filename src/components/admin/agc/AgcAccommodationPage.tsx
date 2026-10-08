"use client";

import { useState } from "react";
import { BedDouble, Boxes, ClipboardList, HandCoins } from "lucide-react";
import { BookingsTab } from "@/components/admin/agc/BookingsTab";
import { PoolsTab } from "@/components/admin/agc/PoolsTab";
import { PoaTab } from "@/components/admin/agc/PoaTab";
import { RoomsTab } from "@/components/admin/agc/RoomsTab";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { cn } from "@/lib/utils";

type AccommodationSection = "bookings" | "poa" | "pools" | "rooms";

const SECTIONS: Array<{
  id: AccommodationSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "bookings", label: "Bookings", icon: ClipboardList },
  { id: "poa", label: "Payment on arrival", icon: HandCoins },
  { id: "pools", label: "Pools", icon: Boxes },
  { id: "rooms", label: "Rooms", icon: BedDouble },
];

/** Accommodation page content: bookings review + capacity pools. */
export function AgcAccommodationPage() {
  const { user } = useAdminSession();
  const [section, setSection] = useState<AccommodationSection>("bookings");
  // The POA booking queue is for admin + finance; accommodation staff get the
  // standard tabs only (matches the registration page's role gating).
  const showPoa = user?.role === "admin" || user?.role === "finance";

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Accommodation sections"
        className="flex w-fit items-center gap-1 rounded-full border p-1"
      >
        {SECTIONS.filter(({ id }) => showPoa || id !== "poa").map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
              section === id
                ? "bg-gold/15 text-ink"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {section === "bookings" ? (
        <BookingsTab />
      ) : section === "poa" ? (
        <PoaTab kind="booking" />
      ) : section === "pools" ? (
        <PoolsTab />
      ) : (
        <RoomsTab />
      )}
    </div>
  );
}
