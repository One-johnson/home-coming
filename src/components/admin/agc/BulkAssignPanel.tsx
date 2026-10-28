"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { BedDouble, Loader2Icon, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import { cn } from "@/lib/utils";

type Guest = {
  _id: string;
  name: string;
  gender: string;
  accommodationType: string;
  hubName: string;
  bookingRef: string;
};

type Room = {
  _id: string;
  accommodationType: string;
  name: string;
  building: string | null;
  gender: string | null;
  capacity: number;
  occupants: number;
  /** Out of inventory while a blocking fault is open. */
  faulty?: boolean;
  /** Desk reservation: not offered for assignment until released. */
  hold?: { note: string } | null;
};

const TYPE_LABEL = (type: string) =>
  AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;

/**
 * One delegate in the waiting list. Memoised on purpose: the desk ticks guests
 * one at a time through a list of hundreds, and re-rendering every row for a
 * single tick is what made the click feel slow.
 */
const GuestRow = memo(function GuestRow({
  guest,
  checked,
  compatible,
  onToggle,
}: {
  guest: Guest;
  checked: boolean;
  compatible: boolean;
  onToggle: (guestId: string) => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm",
        !compatible && "opacity-50",
        checked && "bg-primary/5",
      )}
    >
      <Checkbox
        checked={checked}
        disabled={!compatible}
        onCheckedChange={() => onToggle(guest._id)}
        aria-label={`Select ${guest.name}`}
      />
      <button
        type="button"
        disabled={!compatible}
        onClick={() => onToggle(guest._id)}
        className="min-w-0 flex-1 truncate text-left font-medium disabled:cursor-not-allowed"
      >
        {guest.name}
      </button>
      <span className="hidden w-16 capitalize text-muted-foreground sm:block">
        {guest.gender}
      </span>
      <span className="hidden w-24 truncate text-muted-foreground md:block">
        {guest.hubName}
      </span>
      <span className="w-40 truncate text-right text-xs text-muted-foreground">
        {TYPE_LABEL(guest.accommodationType)}
      </span>
    </li>
  );
});

/**
 * The filtered room inventory. One list backs both the desktop picker and the
 * phone sheet, so filters, free-bed counts and the selected ring cannot drift
 * between the two layouts.
 */
function RoomOptionList({
  rooms,
  selectedId,
  onChoose,
  empty,
}: {
  rooms: Room[];
  selectedId: string;
  onChoose: (room: Room) => void;
  empty: string;
}) {
  if (rooms.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <>
      {rooms.map((candidate) => {
        const bedsFree = candidate.capacity - candidate.occupants;
        const active = candidate._id === selectedId;
        return (
          <button
            key={candidate._id}
            type="button"
            aria-pressed={active}
            onClick={() => onChoose(candidate)}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left transition-colors",
              active
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:bg-muted/60",
            )}
          >
            <span className="block text-sm font-semibold">{candidate.name}</span>
            <span className="block text-xs text-muted-foreground">
              {TYPE_LABEL(candidate.accommodationType)} · {bedsFree} free bed
              {bedsFree === 1 ? "" : "s"} ·{" "}
              {candidate.gender
                ? `${candidate.gender} room`
                : candidate.accommodationType === "ebpv"
                  ? "mixed apartment"
                  : "No gender yet"}
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * Bulk assignment (§6) as one screen: tick who is waiting on the left, pick a
 * bed on the right, assign. Capacity, room type and single-gender rules are
 * shown before submitting and still enforced by the server.
 *
 * On a phone the picker would otherwise sit below the whole waiting list, so
 * the same room list opens in a bottom sheet from a fixed action bar.
 */
export function BulkAssignPanel({
  guests,
  rooms,
}: {
  guests: Guest[];
  rooms: Room[];
}) {
  const { sessionToken } = useAdminSession();
  const assignGuests = useMutation(api.agcRoomAssignments.assignGuests);

  const [gender, setGender] = useState<"any" | "male" | "female">("any");
  const [hub, setHub] = useState("all");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [roomId, setRoomId] = useState<string>("");
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** Phones reach the room picker through this sheet. */
  const [roomSheetOpen, setRoomSheetOpen] = useState(false);

  const hubs = useMemo(
    () => [...new Set(guests.map((guest) => guest.hubName))].sort(),
    [guests],
  );

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return guests.filter((guest) => {
      if (gender !== "any" && guest.gender !== gender) return false;
      if (hub !== "all" && guest.hubName !== hub) return false;
      if (type !== "all" && guest.accommodationType !== type) return false;
      if (term && !guest.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [guests, gender, hub, type, search]);

  /**
   * The room card follows the same filters as the delegate list. A room-type
   * filter is literal; a hub filter narrows to the types that hub's delegates
   * actually booked, because a room of another type could never take them.
   * The selected room is released if a filter hides it, so the Assign button
   * never points at a room that is no longer on screen.
   */
  const roomsShown = useMemo(() => {
    const hubTypes =
      hub === "all"
        ? null
        : new Set(
            guests
              .filter((guest) => guest.hubName === hub)
              .map((guest) => guest.accommodationType),
          );
    return rooms
      .filter((candidate) => {
        // Reserved and faulty rooms are not available inventory.
        if (candidate.faulty || candidate.hold) return false;
        if (candidate.occupants >= candidate.capacity) return false;
        if (type !== "all" && candidate.accommodationType !== type) return false;
        if (hubTypes && !hubTypes.has(candidate.accommodationType)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [guests, hub, rooms, type]);

  /** Changing a filter releases the chosen room, so the button never points
   * at a room the new filter hid. Resetting in the handlers keeps this out of
   * a render-time effect (which would cascade renders). */
  const releaseRoom = () => {
    setRoomId("");
    setPicks([]);
  };

  const room = roomsShown.find((candidate) => candidate._id === roomId) ?? null;
  const free = room ? Math.max(0, room.capacity - room.occupants) : 0;

  /** Guests the selected room can physically take (type + gender lock). */
  const fits = (guest: Guest, target: Room | null) => {
    if (!target) return true;
    if (guest.accommodationType !== target.accommodationType) return false;
    if (target.gender && guest.gender !== target.gender) return false;
    return true;
  };

  const selectable = shown.filter((guest) => fits(guest, room));

  const toggle = useCallback(
    (guestId: string) =>
      setPicks((current) =>
        current.includes(guestId)
          ? current.filter((id) => id !== guestId)
          : [...current, guestId],
      ),
    [],
  );

  /** "Select all shown" never exceeds the chosen room's free beds. */
  const selectAllShown = () => {
    const ids = selectable.map((guest) => guest._id);
    if (room && ids.length > free) {
      toast.info(
        `Only ${free} bed(s) are free in ${room.name} — selected the first ${free}.`,
      );
    }
    setPicks(room ? ids.slice(0, free) : ids);
  };

  const chooseRoom = (next: Room) => {
    setRoomId(next._id);
    setRoomSheetOpen(false);
    // Drop ticks the new room cannot take, so the count never lies.
    setPicks((current) =>
      current.filter((id) => {
        const guest = guests.find((candidate) => candidate._id === id);
        return guest ? fits(guest, next) : false;
      }),
    );
  };

  const assign = async () => {
    if (!sessionToken || !room || picks.length === 0) return;
    setBusy(true);
    try {
      const result = await assignGuests({
        sessionToken,
        roomId: room._id as Id<"agcRooms">,
        guestIds: picks as Id<"agcGuests">[],
      });
      toast.success(
        `Assigned ${result.assigned} delegate(s) to ${room.name}.`,
      );
      setPicks([]);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Assignment failed"));
    } finally {
      setBusy(false);
    }
  };

  const overCapacity = room != null && picks.length > free;

  const emptyRoomMessage =
    type !== "all" || hub !== "all"
      ? "No available room matches these filters — clear them to see the rest."
      : "No free beds — reserved and faulty rooms are excluded; release or fix them first.";

  /**
   * The room picker answers a decision in progress, so it only takes screen
   * space once there is one: a filter narrowing the list, a ticked delegate, or
   * a room already chosen. Until then the delegate list owns the full width.
   */
  const pickerActive =
    gender !== "any" ||
    hub !== "all" ||
    type !== "all" ||
    search.trim() !== "" ||
    picks.length > 0;

  return (
    <div
      className={cn(
        "grid gap-4",
        pickerActive ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1",
      )}
    >
      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">Unassigned delegates ({shown.length})</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Gender:</span>
              {(["any", "male", "female"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={gender === value}
                  onClick={() => {
                    setGender(value);
                    releaseRoom();
                  }}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium capitalize transition-colors",
                    gender === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <Select
              value={hub}
              onValueChange={(value) => {
                setHub(value ?? "all");
                releaseRoom();
              }}
            >
              <SelectTrigger className="h-8 w-auto min-w-32 rounded-full px-3 text-xs" aria-label="Filter by hub">
                <SelectValue>
                  {hub === "all" ? "Hub: Any" : `Hub: ${hub}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Hub: Any</SelectItem>
                {hubs.map((name) => (
                  <SelectItem key={name} value={name}>Hub: {name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value ?? "all");
                releaseRoom();
              }}
            >
              <SelectTrigger className="h-8 w-auto min-w-36 rounded-full px-3 text-xs" aria-label="Filter by room type">
                <SelectValue>
                  {type === "all" ? "Room type: Any" : `Room type: ${TYPE_LABEL(type)}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Room type: Any</SelectItem>
                {Object.entries(AGC_ACCOMMODATION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Name…"
              className="h-8 w-36"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              type="button"
              variant="link"
              className="h-8 px-1 text-xs font-medium"
              onClick={() => {
                setGender("any");
                setHub("all");
                setType("all");
                setSearch("");
                setRoomId("");
                setPicks([]);
              }}
            >
              Clear filters
            </Button>
          </div>

          {shown.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={selectAllShown}
              >
                Select all shown
              </button>
              <button
                type="button"
                className="text-muted-foreground underline underline-offset-2"
                onClick={() => setPicks([])}
              >
                Clear
              </button>
              {room && selectable.length < shown.length && (
                <span className="text-muted-foreground">
                  {shown.length - selectable.length} do not fit {room.name}
                </span>
              )}
            </div>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No unassigned delegate matches these filters.
          </p>
        ) : (
          <ul className="max-h-[420px] divide-y overflow-y-auto max-lg:max-h-none max-lg:overflow-visible">
            {shown.map((guest) => (
              <GuestRow
                key={guest._id}
                guest={guest}
                checked={picks.includes(guest._id)}
                compatible={fits(guest, room)}
                onToggle={toggle}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Desktop keeps the picker beside the list; on phones it is the sheet
          opened from the bar below. */}
      {pickerActive && (
      <div className="hidden h-fit rounded-xl border bg-card lg:sticky lg:top-20 lg:block">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold">
            Assign to room
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({roomsShown.length})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Tick delegates, then pick the room they go to.
          </p>
          {(type !== "all" || hub !== "all") && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Following the filters:{" "}
              {[type !== "all" ? TYPE_LABEL(type) : null, hub !== "all" ? `rooms for ${hub}` : null]
                .filter(Boolean)
                .join(" · ")}
              .{" "}
              <button
                type="button"
                className="font-medium underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  setType("all");
                  setHub("all");
                  releaseRoom();
                }}
              >
                Show all rooms
              </button>
            </p>
          )}
        </div>
        <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
          <RoomOptionList
            rooms={roomsShown}
            selectedId={roomId}
            onChoose={chooseRoom}
            empty={emptyRoomMessage}
          />
        </div>
        <div className="space-y-2 border-t p-3">
          <p className="text-sm font-medium">
            {room
              ? `${picks.length} selected for ${room.name}`
              : `${picks.length} selected — pick a room`}
          </p>
          {overCapacity && (
            <p className="text-xs text-rose-700 dark:text-rose-400">
              {picks.length - free} more than the {free} free bed(s) — untick some.
            </p>
          )}
          <Button
            className="w-full"
            disabled={!room || picks.length === 0 || overCapacity || busy}
            onClick={() => void assign()}
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {room ? `Assign ${picks.length} to ${room.name}` : "Assign"}
          </Button>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BedDouble className="size-3" />
            Type and gender rules are checked again on save.
          </p>
        </div>
      </div>
      )}

      {/* Phones: a fixed bar carries the tick count and the room decision, so
          assigning never means scrolling past the whole waiting list. */}
      {pickerActive && (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {picks.length === 0 ? "No delegates ticked" : `${picks.length} ticked`}
              {room ? ` · ${room.name}` : ""}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {overCapacity
                ? `${picks.length - free} more than the ${free} free bed(s) — untick some.`
                : room
                  ? `${free} free bed${free === 1 ? "" : "s"} in ${room.name}`
                  : "Pick a room to assign them to"}
            </p>
          </div>
          <Button
            type="button"
            variant={room ? "default" : "outline"}
            className="h-10 shrink-0"
            disabled={room !== null && (picks.length === 0 || overCapacity || busy)}
            onClick={() =>
              room ? void assign() : setRoomSheetOpen(true)
            }
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : room ? (
              <UserPlus className="size-4" />
            ) : (
              <BedDouble className="size-4" />
            )}
            {room ? `Assign ${picks.length}` : "Choose room"}
          </Button>
        </div>
        {room && (
          <button
            type="button"
            className="mt-1 text-[11px] text-muted-foreground underline underline-offset-2"
            onClick={() => setRoomSheetOpen(true)}
          >
            Change room
          </button>
        )}
      </div>
      )}

      <Sheet open={roomSheetOpen} onOpenChange={setRoomSheetOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[85dvh] w-full flex-col gap-0 rounded-t-2xl p-0 sm:max-w-none"
        >
          <div
            className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
            aria-hidden
          />
          <SheetHeader className="shrink-0 border-b px-4 py-3 pr-14">
            <SheetTitle>Choose a room</SheetTitle>
            <SheetDescription>
              {picks.length === 0
                ? "Tick the delegates in the list first, then pick the room they go to."
                : `${picks.length} delegate${picks.length === 1 ? "" : "s"} waiting for a room.`}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-6">
            <RoomOptionList
              rooms={roomsShown}
              selectedId={roomId}
              onChoose={chooseRoom}
              empty={emptyRoomMessage}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
