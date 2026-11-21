"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type SectionTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Small count shown after the label (e.g. items awaiting review). */
  count?: number;
};

/**
 * The console's one section switcher: a chocolate pill bar that scrolls
 * sideways on phones instead of overflowing. Pair with `useUrlSection` so the
 * open section survives reloads and can be linked to.
 */
export function SectionTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: SectionTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("-mx-1 overflow-x-auto px-1 pb-1", className)}>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex min-w-max items-center gap-1 rounded-full border bg-card p-1 shadow-soft"
      >
        {items.map(({ id, label: itemLabel, icon: Icon, count }) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(id)}
              className={cn(
                "flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {Icon ? (
                <Icon className={cn("size-4", active && "text-gold-light")} />
              ) : null}
              {itemLabel}
              {count !== undefined && count > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                    active
                      ? "bg-gold-light text-[#2b1b12]"
                      : "bg-amber-100 text-amber-900",
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The open section, kept in `?<key>=` so reloads and shared links land on the
 * same tab. Other query params (filters) are preserved. Needs a Suspense
 * boundary above it, like any `useSearchParams` caller.
 */
export function useUrlSection<T extends string>(
  allowed: readonly T[],
  fallback: T,
  key = "tab",
): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = searchParams.get(key);
  const value =
    raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete(key);
      else params.set(key, next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [fallback, key, pathname, router, searchParams],
  );

  return [value, setValue];
}
