"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  COUNTRY_DIAL_CODES,
  countryFlagSvgUrl,
  findCountryByDialCode,
  type CountryDialCode,
} from "@/lib/countryDialCodes";
import { cn } from "@/lib/utils";

function CountryFlag({
  iso2,
  name,
  className,
}: {
  iso2: string;
  name: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote SVG flags; avoid next/image config
    <img
      src={countryFlagSvgUrl(iso2)}
      alt=""
      title={name}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      className={cn(
        "h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-border/60",
        className,
      )}
    />
  );
}

type CountryCodeSelectProps = {
  value: string;
  onValueChange: (dialCode: string) => void;
  id?: string;
  className?: string;
  preferredIso?: string;
  disabled?: boolean;
};

export function CountryCodeSelect({
  value,
  onValueChange,
  id,
  className,
  preferredIso,
  disabled,
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (selectedIso) {
      const byIso = COUNTRY_DIAL_CODES.find((c) => c.iso2 === selectedIso);
      if (byIso && byIso.dialCode === value) return byIso;
    }
    return findCountryByDialCode(value, preferredIso);
  }, [preferredIso, selectedIso, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_DIAL_CODES;
    return COUNTRY_DIAL_CODES.filter(
      (country) =>
        country.name.toLowerCase().includes(q) ||
        country.dialCode.includes(q) ||
        country.iso2.toLowerCase().includes(q),
    );
  }, [query]);

  const choose = (country: CountryDialCode) => {
    setSelectedIso(country.iso2);
    onValueChange(country.dialCode);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label="Country calling code"
            className={cn(
              "h-8 w-[7.25rem] shrink-0 justify-between gap-1.5 px-2 font-normal",
              className,
            )}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selected ? (
            <CountryFlag iso2={selected.iso2} name={selected.name} />
          ) : (
            <span className="h-3.5 w-5 shrink-0 rounded-[2px] bg-muted" />
          )}
          <span className="truncate tabular-nums">
            {selected?.dialCode ?? (value || "Code")}
          </span>
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-2 p-2"
        sideOffset={6}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search country or code…"
          autoFocus
          className="h-8"
        />
        <div
          role="listbox"
          aria-label="Country calling codes"
          className="max-h-60 overflow-y-auto overscroll-contain"
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No countries found.
            </p>
          ) : (
            filtered.map((country) => {
              const isSelected = selected?.iso2 === country.iso2;
              return (
                <button
                  key={country.iso2}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(country)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent/60",
                  )}
                >
                  <CountryFlag iso2={country.iso2} name={country.name} />
                  <span className="min-w-0 flex-1 truncate">{country.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {country.dialCode}
                  </span>
                  {isSelected ? (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="size-3.5 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
