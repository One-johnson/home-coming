"use client";

import Image from "next/image";
import { MapPinIcon } from "lucide-react";
import type { Doc } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveTourImage } from "@/lib/tourConfig";
import { cn } from "@/lib/utils";

type TourPackageCardProps = {
  pkg: Doc<"tourPackages">;
  selectedQuantity?: number;
  onSelect: () => void;
};

export function TourPackageCard({
  pkg,
  selectedQuantity = 0,
  onSelect,
}: TourPackageCardProps) {
  const imageSrc = resolveTourImage(pkg);
  const inCart = selectedQuantity > 0;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border bg-background shadow-sm transition-shadow",
        inCart
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:shadow-md",
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <Image
          src={imageSrc}
          alt={`${pkg.label}: ${pkg.dateLabel}`}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          priority={false}
        />
        {pkg.badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-emerald-700/95 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-sm">
            {pkg.badge}
          </span>
        ) : null}
        {inCart ? (
          <Badge className="absolute right-3 top-3" variant="default">
            {selectedQuantity} in cart
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          <h3 className="font-display text-xl leading-snug text-foreground">
            {pkg.label}: {pkg.dateLabel}
          </h3>
          <p className="text-sm text-muted-foreground">
            {pkg.timeRange}
            <span className="mx-1.5 text-border">•</span>
            {pkg.meals}
          </p>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <MapPinIcon className="size-3.5" />
            Sites to visit
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {pkg.sites.map((site) => (
              <li key={site}>{site}</li>
            ))}
          </ul>
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">from</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              ${pkg.priceUsd}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                USD
              </span>
            </p>
          </div>
          <Button type="button" onClick={onSelect}>
            {inCart ? "Update tickets" : "Book this tour"}
          </Button>
        </div>
      </div>
    </article>
  );
}
