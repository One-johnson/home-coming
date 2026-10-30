"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  BedDouble,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Search,
  Users,
  X,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DirectoryRep = {
  repId: string;
  repName: string;
  hubName: string;
  region: string;
  delegateCount: number;
  assignedCount: number;
};

type DirectoryDelegate = {
  guestId: string;
  name: string;
  gender: string;
  repId: string;
  repName: string;
  hubName: string;
  region: string;
  bookingRef: string;
  roomName: string | null;
  building: string | null;
  accommodationType: string | null;
  typeLabel: string | null;
  checkedIn: boolean;
};

type RoomFilter = "all" | "in_room" | "unassigned";

const ALL = "all";

/** Rows shown in a rep card before "Show all" — keeps a phone list short. */
const COLLAPSED_ROWS = 6;

function label(value: string) {
  return value.replace(/_/g, " ");
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
}) {
  // Radix renders the raw value until the list has mounted, so spell the
  // selected option out here instead of showing "all".
  const selected =
    value === ALL
      ? placeholder
      : (options.find((option) => option.value === value)?.label ?? placeholder);

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (!next) return;
        onChange(next);
      }}
    >
      <SelectTrigger aria-label={ariaLabel} className="h-10 w-full min-w-0">
        <SelectValue placeholder={placeholder} className="truncate">
          {selected}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DelegateRow({ delegate }: { delegate: DirectoryDelegate }) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{delegate.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {delegate.gender}
          {delegate.bookingRef ? ` · ${delegate.bookingRef}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {delegate.roomName ? (
          <>
            <p className="flex items-center justify-end gap-1 text-sm font-semibold text-ink">
              <BedDouble className="size-3.5 text-muted-foreground" />
              {delegate.roomName}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {[delegate.building, delegate.typeLabel]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        ) : (
          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            No room yet
          </span>
        )}
        {delegate.checkedIn && (
          <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="size-3" />
            Checked in
          </p>
        )}
      </div>
    </li>
  );
}

function RepCard({
  rep,
  rows,
  forceOpen,
}: {
  rep: DirectoryRep;
  rows: DirectoryDelegate[];
  /** A filter is active — show every match instead of the first few. */
  forceOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = forceOpen || expanded;
  const visible = open ? rows : rows.slice(0, COLLAPSED_ROWS);
  const hidden = rows.length - visible.length;
  const missing = rows.filter((row) => !row.roomName).length;

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b bg-muted/30 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {rep.hubName || rep.repName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {rep.repName} · {label(rep.region)}
            </p>
          </div>
          <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums">
            {rows.length} delegate{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <BedDouble className="size-3" />
            {rows.length - missing} in rooms
          </span>
          {missing > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
              <X className="size-3" />
              {missing} without a room
            </span>
          )}
        </div>
      </header>

      <ul className="divide-y">
        {visible.map((delegate) => (
          <DelegateRow key={delegate.guestId} delegate={delegate} />
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-medium text-gold-dark transition-colors hover:bg-muted/40"
        >
          Show all {rows.length} delegates
          <ChevronDown className="size-3.5" />
        </button>
      )}
    </section>
  );
}

/**
 * Read-only delegate directory for accommodation volunteers (and the
 * accommodation team). Built phone-first: a sticky filter bar and one card per
 * rep, so a volunteer at the door can search a name or a room and read the
 * answer in one glance.
 */
export function DelegateDirectory() {
  const { sessionToken } = useAdminSession();
  const directory = useQuery(
    api.agcDirectory.listDelegateDirectory,
    sessionToken ? { sessionToken } : "skip",
  );

  const [term, setTerm] = useState("");
  const [repId, setRepId] = useState<string>(ALL);
  const [building, setBuilding] = useState<string>(ALL);
  const [room, setRoom] = useState<string>(ALL);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");

  const reps = useMemo<DirectoryRep[]>(() => directory?.reps ?? [], [directory]);
  const delegates = useMemo<DirectoryDelegate[]>(() => directory?.delegates ?? [], [
    directory,
  ]);

  const buildings = useMemo(
    () =>
      [
        ...new Set(
          delegates
            .map((delegate) => delegate.building)
            .filter((value): value is string => !!value),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [delegates],
  );

  const rooms = useMemo(
    () =>
      [
        ...new Set(
          delegates
            .filter(
              (delegate) =>
                building === ALL || delegate.building === building,
            )
            .map((delegate) => delegate.roomName)
            .filter((value): value is string => !!value),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [delegates, building],
  );

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return delegates.filter((delegate) => {
      if (repId !== ALL && delegate.repId !== repId) return false;
      if (building !== ALL && delegate.building !== building) return false;
      if (room !== ALL && delegate.roomName !== room) return false;
      if (roomFilter === "in_room" && !delegate.roomName) return false;
      if (roomFilter === "unassigned" && delegate.roomName) return false;
      if (!needle) return true;
      return (
        delegate.name.toLowerCase().includes(needle) ||
        delegate.hubName.toLowerCase().includes(needle) ||
        (delegate.roomName ?? "").toLowerCase().includes(needle) ||
        (delegate.building ?? "").toLowerCase().includes(needle) ||
        delegate.bookingRef.toLowerCase().includes(needle)
      );
    });
  }, [delegates, term, repId, building, room, roomFilter]);

  const groups = useMemo(() => {
    const rowsByRep = new Map<string, DirectoryDelegate[]>();
    for (const delegate of filtered) {
      const list = rowsByRep.get(delegate.repId) ?? [];
      list.push(delegate);
      rowsByRep.set(delegate.repId, list);
    }
    return reps
      .filter((rep) => rowsByRep.has(rep.repId))
      .map((rep) => ({ rep, rows: rowsByRep.get(rep.repId) ?? [] }));
  }, [filtered, reps]);

  const filtering =
    term.trim() !== "" ||
    repId !== ALL ||
    building !== ALL ||
    room !== ALL ||
    roomFilter !== "all";
  const unassigned = filtered.filter((delegate) => !delegate.roomName).length;

  const clearFilters = () => {
    setTerm("");
    setRepId(ALL);
    setBuilding(ALL);
    setRoom(ALL);
    setRoomFilter("all");
  };

  return (
    <div className="space-y-4">
      {/* Sticky so a volunteer can re-filter a long list without scrolling
          back up on a phone. The console header is 64px tall (top-16). */}
      <div className="sticky top-16 z-20 -mx-4 space-y-2 border-b border-border/60 bg-neutral-100/95 px-4 pt-2 pb-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search delegate, hub, room or reference…"
            aria-label="Search the directory"
            className="h-10 bg-white pl-9 text-base sm:text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <FilterSelect
            value={repId}
            onChange={setRepId}
            placeholder="All reps"
            ariaLabel="Filter by rep"
            options={reps.map((rep) => ({
              value: rep.repId,
              label: rep.hubName || rep.repName,
            }))}
          />
          <FilterSelect
            value={building}
            onChange={(next) => {
              setBuilding(next);
              setRoom(ALL);
            }}
            placeholder="All buildings"
            ariaLabel="Filter by building"
            options={buildings.map((value) => ({ value, label: value }))}
          />
          <FilterSelect
            value={room}
            onChange={setRoom}
            placeholder="All rooms"
            ariaLabel="Filter by room"
            options={rooms.map((value) => ({ value, label: value }))}
          />
          <FilterSelect
            value={roomFilter}
            onChange={(next) => setRoomFilter(next as RoomFilter)}
            placeholder="Any status"
            ariaLabel="Filter by room status"
            options={[
              { value: "in_room", label: "In a room" },
              { value: "unassigned", label: "No room yet" },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground tabular-nums">
              {filtered.length.toLocaleString()}
            </span>{" "}
            delegate{filtered.length === 1 ? "" : "s"} across{" "}
            <span className="font-medium text-foreground tabular-nums">
              {groups.length}
            </span>{" "}
            rep{groups.length === 1 ? "" : "s"}
            {unassigned > 0 ? ` · ${unassigned} without a room` : ""}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 font-medium text-gold-dark hover:underline"
            >
              <X className="size-3" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {directory === undefined ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3].map((key) => (
            <div
              key={key}
              className="h-40 animate-pulse rounded-xl border bg-muted/40"
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center">
          <Users className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No delegates match</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {delegates.length === 0
              ? "No delegates have their room details on file yet."
              : "Try a shorter search, or clear the filters."}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs font-medium text-gold-dark hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div
          className={cn("grid gap-3", "lg:grid-cols-2 2xl:grid-cols-3")}
          aria-live="polite"
        >
          {groups.map(({ rep, rows }) => (
            <RepCard
              key={rep.repId}
              rep={rep}
              rows={rows}
              forceOpen={filtering}
            />
          ))}
        </div>
      )}

      {directory && delegates.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <MapPin className="size-3" />
          Read-only — rooms are assigned by the accommodation team.
        </p>
      )}
    </div>
  );
}
