"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  MapPinIcon,
  PhoneIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { isConvexConfigured } from "@/lib/convex-config";
import { cn } from "@/lib/utils";

/**
 * Preferred commercial hotels near campus. Accommodation itself is booked
 * through hub representatives in the rep portal — this list is informational
 * (contact, rates, distance, discount codes).
 *
 * The `isConvexConfigured()` guard lives OUTSIDE the component that calls
 * `useQuery`, so static prerendering (no Convex env) never mounts the hook.
 */
export function PreferredHotels() {
  if (!isConvexConfigured()) return null;
  return <PreferredHotelsConnected />;
}

/**
 * "GHS 700 per room" → { amount: "GHS 700", suffix: "per room" } so the
 * number can carry the visual weight and the wording stays exactly as the
 * hotel confirmed it. Anything unexpected is shown verbatim.
 */
function splitRate(rate?: string) {
  if (!rate?.trim()) return { amount: null, suffix: "Rate to be confirmed" };
  const match = rate
    .trim()
    .match(/^(GHS|GH₵|USD|\$)\s*([\d,]+(?:\.\d+)?)\s*(.*)$/i);
  if (!match) return { amount: null, suffix: rate.trim() };
  return {
    amount: `${match[1]} ${match[2]}`.replace(/\s+/g, " "),
    suffix: match[3]?.trim() || "per room",
  };
}

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground";

function PreferredHotelsConnected() {
  const hotels = useQuery(api.content.listHotels);
  const [location, setLocation] = useState<string>("all");

  const list = useMemo(() => hotels ?? [], [hotels]);

  /** Towns, most-stocked first — the fastest way through 17 hotels. */
  const locations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const hotel of list) {
      const town = hotel.distance?.trim() || "Other";
      counts.set(town, (counts.get(town) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([town, count]) => ({ town, count }));
  }, [list]);

  const visible = useMemo(
    () =>
      location === "all"
        ? list
        : list.filter((hotel) => (hotel.distance?.trim() || "Other") === location),
    [list, location],
  );

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow mb-3">Off-campus stays</p>
        <h2 className="font-display text-3xl text-foreground md:text-4xl">
          Preferred Hotels
        </h2>
        <div className="ornament mt-5" aria-hidden>
          <span className="ornament-diamond" />
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          Prefer to stay off campus? These hotels are near Anagkazo Campus in
          Mampong. Book through your denomination or hub coordinator, and
          mention the conference for any listed rate or discount.
        </p>
      </div>

      {locations.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setLocation("all")}
            aria-pressed={location === "all"}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              location === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary",
            )}
          >
            All stays
            <span className="ml-1.5 tabular-nums opacity-70">{list.length}</span>
          </button>
          {locations.map(({ town, count }) => (
            <button
              key={town}
              type="button"
              onClick={() => setLocation(town)}
              aria-pressed={location === town}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                location === town
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-primary",
              )}
            >
              {town}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {list.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Preferred hotel details coming soon.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((hotel) => {
            const { amount, suffix } = splitRate(hotel.rate);
            return (
              <article
                key={hotel._id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/60 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
                  aria-hidden
                />

                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-xl leading-tight text-foreground">
                    {hotel.name}
                  </h3>
                  <div className="shrink-0 text-right">
                    {amount ? (
                      <>
                        <p className="text-base font-semibold leading-none tabular-nums text-primary">
                          {amount}
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                          {suffix}
                        </p>
                      </>
                    ) : (
                      <p className="max-w-[8rem] text-xs text-muted-foreground">
                        {suffix}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={pillClass}>
                    <MapPinIcon className="size-3.5" />
                    {hotel.distance?.trim() || "Location to be confirmed"}
                  </span>
                  {hotel.instructions ? (
                    <span className={pillClass}>
                      <UsersIcon className="size-3.5" />
                      {hotel.instructions}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3 text-xs">
                  <p className="flex items-start gap-1.5 text-muted-foreground">
                    <PhoneIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <span className="font-medium text-foreground">
                        Contact:
                      </span>{" "}
                      {hotel.contact?.trim() || "Coming soon"}
                    </span>
                  </p>
                </div>

                {hotel.discountCode ? (
                  <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 px-2 py-1 text-[11px] font-semibold tracking-wide text-primary">
                    <TagIcon className="size-3.5" />
                    {hotel.discountCode}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {list.length > 0 && visible.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          No hotels listed in that area yet.
        </p>
      ) : null}
    </div>
  );
}
