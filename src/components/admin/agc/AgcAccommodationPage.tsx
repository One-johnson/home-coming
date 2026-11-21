"use client";

import { BedDouble, Boxes, ClipboardList, Flag, HandCoins } from "lucide-react";
import { BookingsTab } from "@/components/admin/agc/BookingsTab";
import { PoolsTab } from "@/components/admin/agc/PoolsTab";
import { PoaTab } from "@/components/admin/agc/PoaTab";
import { ReviewFlagsTab } from "@/components/admin/agc/ReviewFlagsTab";
import { RoomsTab } from "@/components/admin/agc/RoomsTab";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  SectionTabs,
  useUrlSection,
} from "@/components/admin/kit/SectionTabs";

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
export function AgcAccommodationPage() {
  const { user } = useAdminSession();
  // Deep links (?tab=poa|pools|rooms|flags) and reloads land on the same tab.
  const [section, setSection] = useUrlSection<AccommodationSection>(
    SECTIONS.map((entry) => entry.id),
    "bookings",
  );
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
      <SectionTabs
        label="Accommodation sections"
        value={activeSection}
        onChange={setSection}
        items={SECTIONS.filter(({ id }) => allowed(id))}
      />

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
