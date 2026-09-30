"use client";

import { useState } from "react";
import { Boxes, ClipboardList } from "lucide-react";
import { BookingsTab } from "@/components/admin/agc/BookingsTab";
import { PoolsTab } from "@/components/admin/agc/PoolsTab";
import { cn } from "@/lib/utils";

type AccommodationSection = "bookings" | "pools";

const SECTIONS: Array<{
  id: AccommodationSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "bookings", label: "Bookings", icon: ClipboardList },
  { id: "pools", label: "Pools", icon: Boxes },
];

/** Accommodation page content: bookings review + capacity pools. */
export function AgcAccommodationPage() {
  const [section, setSection] = useState<AccommodationSection>("bookings");

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Accommodation sections"
        className="flex w-fit items-center gap-1 rounded-full border p-1"
      >
        {SECTIONS.map(({ id, label, icon: Icon }) => (
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

      {section === "bookings" ? <BookingsTab /> : <PoolsTab />}
    </div>
  );
}
