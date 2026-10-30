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
  roomCapacity: number | null;
  accommodationType: string;
  typeLabel: string;
  checkedIn: boolean;
};

type RoomFilter = "all" | "in_room" | "unassigned";

type RoomGroup = {
  key: string;
  roomName: string | null;
  building: string | null;
  capacity: number | null;
  rows: DirectoryDelegate[];
};

const ALL = "all";

/** Short names for the type filter — the catalogue labels are too long here. */
const TYPE_SHORT_LABELS: Record<string, string> = {
  dormitory: "Dormitory",
  hostel: "Hostel",
  wise_serpents: "Wise as Serpents",
  good_general: "Good General",
  ebpv: "EBPV apartments",
};

const TYPE_ORDER = Object.keys(TYPE_SHORT_LABELS);

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
};

const UNASSIGNED_KEY = "__unassigned";

/** Room rows a rep card shows before "Show all rooms". */
const ROOM_PAGE = 6;

/** Search hits shown at once — a query this broad is rare, but capped anyway. */
const FLAT_PAGE = 20;

/** A card this small reads better fully open than behind taps. */
const AUTO_OPEN_GROUPS = 3;

function typeName(value: string) {
  return TYPE_SHORT_LABELS[value] ?? value.replace(/_/g, " ");
}

function label(value: string) {
  return value.replace(/_/g, " ");
}

/**
 * One row per room, not per delegate: a hub's card then reads as "Room C10R1 —
 * 4 of 6 beds" instead of forty names, and the names appear only for the room
 * someone opens.
 */
function groupByRoom(rows: DirectoryDelegate[]): RoomGroup[] {
  const groups = new Map<string, RoomGroup>();
  for (const row of rows) {
    const key = row.roomName
      ? `${row.roomName}||${row.building ?? ""}`
      : UNASSIGNED_KEY;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(key, {
      key,
      roomName: row.roomName,
      building: row.building,
      capacity: row.roomCapacity,
      rows: [row],
    });
  }
  return [...groups.values()].sort((a, b) => {
    // Rooms first, in physical order; the "no room yet" pile always last.
    if (a.roomName === null) return 1;
    if (b.roomName === null) return -1;
    return (
      a.roomName.localeCompare(b.roomName, undefined, { numeric: true }) ||
      (a.building ?? "").localeCompare(b.building ?? "")
    );
  });
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

function DelegateRow({
  delegate,
  showRoom = false,
}: {
  delegate: DirectoryDelegate;
  /** Off inside a room group — the group header already names the room. */
  showRoom?: boolean;
}) {
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
        {showRoom &&
          (delegate.roomName ? (
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
            <>
              <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                No room yet
              </span>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {typeName(delegate.accommodationType)}
              </p>
            </>
          ))}
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

function RoomRow({
  group,
  open,
  onToggle,
}: {
  group: RoomGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const checkedIn = group.rows.filter((row) => row.checkedIn).length;
  const occupancy = group.capacity
    ? `${group.rows.length}/${group.capacity} beds`
    : `${group.rows.length} delegate${group.rows.length === 1 ? "" : "s"}`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg",
            group.roomName
              ? "bg-muted text-foreground"
              : "bg-amber-100 text-amber-800",
          )}
        >
          {group.roomName ? (
            <BedDouble className="size-3.5" />
          ) : (
            <X className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {group.roomName ?? "Not in a room yet"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {[
              group.building,
              occupancy,
              checkedIn > 0 ? `${checkedIn} checked in` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul className="divide-y border-t bg-muted/10">
          {group.rows.map((delegate) => (
            <DelegateRow key={delegate.guestId} delegate={delegate} />
          ))}
        </ul>
      )}
    </li>
  );
}

function RepCard({
  rep,
  rows,
  flat,
}: {
  rep: DirectoryRep;
  rows: DirectoryDelegate[];
  /** A search is running: show the hits themselves, not the room outline. */
  flat: boolean;
}) {
  const groups = useMemo(() => groupByRoom(rows), [rows]);
  // Small cards open themselves; a hub with dozens of rooms starts collapsed
  // so the card stays a short, scannable list.
  const openByDefault = groups.length <= AUTO_OPEN_GROUPS;
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);

  const missing = rows.filter((row) => !row.roomName).length;
  const roomCount = groups.filter((group) => group.roomName).length;
  const checkedIn = rows.filter((row) => row.checkedIn).length;

  const visibleRows = showAll ? rows : rows.slice(0, FLAT_PAGE);
  const visibleGroups = showAll ? groups : groups.slice(0, ROOM_PAGE);
  const more =
    (flat ? rows.length : groups.length) -
    (flat ? visibleRows.length : visibleGroups.length);

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
            {roomCount} room{roomCount === 1 ? "" : "s"}
          </span>
          {checkedIn > 0 && (
            <span className="inline-flex items-center gap-1 text-sky-700">
              <CheckCircle2 className="size-3" />
              {checkedIn} checked in
            </span>
          )}
          {missing > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
              <X className="size-3" />
              {missing} without a room
            </span>
          )}
        </div>
      </header>

      <ul className="divide-y">
        {flat
          ? visibleRows.map((delegate) => (
              <DelegateRow key={delegate.guestId} delegate={delegate} showRoom />
            ))
          : visibleGroups.map((group) => (
              <RoomRow
                key={group.key}
                group={group}
                open={toggled[group.key] ?? openByDefault}
                onToggle={() =>
                  setToggled((prev) => ({
                    ...prev,
                    [group.key]: !(prev[group.key] ?? openByDefault),
                  }))
                }
              />
            ))}
      </ul>

      {more > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-medium text-gold-dark transition-colors hover:bg-muted/40"
        >
          Show all {flat ? `${rows.length} delegates` : `${groups.length} rooms`}
          <ChevronDown className="size-3.5" />
        </button>
      )}
    </section>
  );
}

/**
 * Read-only delegate directory for accommodation volunteers (and the
 * accommodation team). Built phone-first: a sticky filter bar, then one card
 * per rep whose body is its rooms with live occupancy. Names only appear for
 * the room you open (or for a search hit), so a 100-delegate hub never becomes
 * an endless scroll.
 */
export function DelegateDirectory() {
  const { sessionToken } = useAdminSession();
  const directory = useQuery(
    api.agcDirectory.listDelegateDirectory,
    sessionToken ? { sessionToken } : "skip",
  );

  const [term, setTerm] = useState("");
  const [repId, setRepId] = useState<string>(ALL);
  const [accommodationType, setAccommodationType] = useState<string>(ALL);
  const [gender, setGender] = useState<string>(ALL);
  const [building, setBuilding] = useState<string>(ALL);
  const [room, setRoom] = useState<string>(ALL);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");

  const reps = useMemo<DirectoryRep[]>(() => directory?.reps ?? [], [directory]);
  const delegates = useMemo<DirectoryDelegate[]>(() => directory?.delegates ?? [], [
    directory,
  ]);

  // Only the types actually booked, in catalogue order, so the filter never
  // offers a type nobody is in.
  const accommodationTypes = useMemo(
    () =>
      [...new Set(delegates.map((delegate) => delegate.accommodationType))].sort(
        (a, b) =>
          TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b) ||
          a.localeCompare(b),
      ),
    [delegates],
  );

  const genders = useMemo(
    () =>
      [...new Set(delegates.map((delegate) => delegate.gender))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [delegates],
  );

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
      if (
        accommodationType !== ALL &&
        delegate.accommodationType !== accommodationType
      ) {
        return false;
      }
      if (gender !== ALL && delegate.gender !== gender) return false;
      if (building !== ALL && delegate.building !== building) return false;
      if (room !== ALL && delegate.roomName !== room) return false;
      if (roomFilter === "in_room" && !delegate.roomName) return false;
      if (roomFilter === "unassigned" && delegate.roomName) return false;
      if (!needle) return true;
      // Search covers the words on the row, so "female", "hostel" or "ebpv"
      // typed into the box narrows the list the same way the dropdowns do.
      return (
        delegate.name.toLowerCase().includes(needle) ||
        delegate.hubName.toLowerCase().includes(needle) ||
        (delegate.roomName ?? "").toLowerCase().includes(needle) ||
        (delegate.building ?? "").toLowerCase().includes(needle) ||
        delegate.bookingRef.toLowerCase().includes(needle) ||
        delegate.gender.toLowerCase().includes(needle) ||
        typeName(delegate.accommodationType).toLowerCase().includes(needle)
      );
    });
  }, [
    delegates,
    term,
    repId,
    accommodationType,
    gender,
    building,
    room,
    roomFilter,
  ]);

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
    accommodationType !== ALL ||
    gender !== ALL ||
    building !== ALL ||
    room !== ALL ||
    roomFilter !== "all";
  const searching = term.trim() !== "";
  const unassigned = filtered.filter((delegate) => !delegate.roomName).length;

  const clearFilters = () => {
    setTerm("");
    setRepId(ALL);
    setAccommodationType(ALL);
    setGender(ALL);
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
            placeholder="Search name, hub, room, gender or type…"
            aria-label="Search the directory"
            className="h-10 bg-white pl-9 text-base sm:text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
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
            value={accommodationType}
            onChange={setAccommodationType}
            placeholder="All accommodation"
            ariaLabel="Filter by accommodation type"
            options={accommodationTypes.map((value) => ({
              value,
              label: typeName(value),
            }))}
          />
          <FilterSelect
            value={gender}
            onChange={setGender}
            placeholder="Any gender"
            ariaLabel="Filter by gender"
            options={genders.map((value) => ({
              value,
              label: GENDER_LABELS[value] ?? value,
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
            <RepCard key={rep.repId} rep={rep} rows={rows} flat={searching} />
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
