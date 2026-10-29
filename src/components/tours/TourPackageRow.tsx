"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ChevronDownIcon,
  ClockIcon,
  MinusIcon,
  PlusIcon,
  UtensilsIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  resolveTourImage,
  tourDayChip,
  type TourPackageDisplay,
} from "@/lib/tourConfig";
import { cn } from "@/lib/utils";

/** Shared quantity stepper — used on the row and inside the checkout sheet. */
export function TourQuantityStepper({
  label,
  quantity,
  onChange,
}: {
  label: string;
  quantity: number;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        onClick={() => onChange(quantity - 1)}
        aria-label={`Decrease ${label}`}
      >
        <MinusIcon className="size-3.5" />
      </Button>
      <span className="w-8 text-center text-base font-semibold tabular-nums">
        {quantity}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        onClick={() => onChange(quantity + 1)}
        aria-label={`Increase ${label}`}
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * One comparison row per tour: date, facts and price line up across rows so
 * the choice is scannable, and the sites list stays collapsed until asked
 * for. ~150px on a phone instead of a full-screen poster.
 */
export function TourPackageRow({
  pkg,
  quantity,
  onQuantityChange,
}: {
  pkg: TourPackageDisplay;
  quantity: number;
  onQuantityChange: (qty: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = quantity > 0;
  const notIncluded = pkg.notIncluded ?? [];

  return (
    <article
      id={`tour-${pkg.slug}`}
      className={cn(
        "scroll-mt-28 rounded-2xl border bg-background p-3 transition-colors sm:p-4",
        selected
          ? "border-primary ring-1 ring-primary/20"
          : "border-border hover:border-primary/40",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28">
          <Image
            src={resolveTourImage(pkg)}
            alt=""
            fill
            sizes="(max-width: 640px) 80px, 112px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
                  {tourDayChip(pkg)}
                </span>
                {pkg.badge ? (
                  <span className="rounded-full bg-emerald-700/95 px-2.5 py-1 text-xs font-semibold tracking-wide text-white">
                    {pkg.badge}
                  </span>
                ) : null}
                {selected ? (
                  <Badge variant="default" className="text-xs">
                    {quantity} in cart
                  </Badge>
                ) : null}
              </div>
              <h3 className="mt-2 font-display text-xl leading-snug text-foreground sm:text-2xl">
                {pkg.label}: {pkg.dateLabel}
              </h3>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="size-4" />
                  {pkg.timeRange}
                </span>
                <span aria-hidden className="text-border">
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  <UtensilsIcon className="size-4" />
                  {pkg.meals}
                </span>
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-2xl font-semibold leading-none tabular-nums text-foreground sm:text-3xl">
                ${pkg.priceUsd}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                USD
              </p>
              {typeof pkg.priceGhs === "number" ? (
                <p className="text-sm tabular-nums text-muted-foreground">
                  GH₵{pkg.priceGhs.toLocaleString("en-GH")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-controls={`tour-${pkg.slug}-details`}
              className="flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              {pkg.sites.length} site{pkg.sites.length === 1 ? "" : "s"} ·{" "}
              {expanded ? "hide details" : "see details"}
              <ChevronDownIcon
                className={cn(
                  "size-3.5 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>

            {selected ? (
              <TourQuantityStepper
                label={pkg.label}
                quantity={quantity}
                onChange={onQuantityChange}
              />
            ) : (
              <Button onClick={() => onQuantityChange(1)}>Select</Button>
            )}
          </div>

          {expanded ? (
            <div
              id={`tour-${pkg.slug}-details`}
              className="mt-3 space-y-3 rounded-xl bg-muted/50 p-3 text-base"
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Sites to visit
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
                  {pkg.sites.map((site) => (
                    <li key={site}>{site}</li>
                  ))}
                </ul>
              </div>
              {pkg.departurePoint ? (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Departs from:
                  </span>{" "}
                  {pkg.departurePoint}
                </p>
              ) : null}
              {notIncluded.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Not included
                  </p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {notIncluded.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
