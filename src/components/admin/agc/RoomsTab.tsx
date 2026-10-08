"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BedDouble,
  DoorOpen,
  Printer,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import { cn } from "@/lib/utils";

type RoomRow = {
  _id: string;
  accommodationType: string;
  name: string;
  gender: string | null;
  capacity: number;
  note: string | null;
  occupants: number;
  assignments: { _id: string; guestId: string; bookingId: string }[];
};

type UnassignedGuest = {
  _id: string;
  bookingId: string;
  name: string;
  gender: string;
  accommodationType: string;
  hubName: string;
  bookingRef: string;
};

type RoomingRoom = {
  _id: string;
  accommodationType: string;
  typeLabel: string;
  name: string;
  gender: string | null;
  capacity: number;
  occupants: {
    _id: string;
    name: string;
    gender: string | null;
    hubName: string;
    bookingRef: string;
  }[];
};

const TYPES = ["dormitory", "hostel", "wise_serpents", "good_general", "ebpv"] as const;
const TYPE_LABEL = (type: string) =>
  AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;

export function RoomsTab() {
  const { sessionToken } = useAdminSession();
  const rooms = useQuery(
    api.agcRoomAssignments.listRoomsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const unassigned = useQuery(
    api.agcRoomAssignments.listUnassignedGuestsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const upsertRoom = useMutation(api.agcRoomAssignments.upsertRoom);
  const deleteRoom = useMutation(api.agcRoomAssignments.deleteRoom);
  const assignGuests = useMutation(api.agcRoomAssignments.assignGuests);
  const unassignGuest = useMutation(api.agcRoomAssignments.unassignGuest);
  const autoAssign = useMutation(api.agcRoomAssignments.autoAssignGuests);

  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomRow | null>(null);
  const [roomForm, setRoomForm] = useState({
    accommodationType: "dormitory",
    name: "",
    gender: "any",
    capacity: "2",
  });
  const [assignRoom, setAssignRoom] = useState<RoomRow | null>(null);
  const [assignPicks, setAssignPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [roomingOpen, setRoomingOpen] = useState(false);
  const [roomingType, setRoomingType] = useState<string>("all");

  const list = rooms ?? [];
  const guests = useMemo(() => unassigned ?? [], [unassigned]);
  const totalBeds = list.reduce((sum, room) => sum + room.capacity, 0);
  const usedBeds = list.reduce((sum, room) => sum + room.occupants, 0);

  const openRoomForm = (room: RoomRow | null) => {
    setEditingRoom(room);
    setRoomForm(
      room
        ? {
            accommodationType: room.accommodationType,
            name: room.name,
            gender: room.gender ?? "any",
            capacity: String(room.capacity),
          }
        : { accommodationType: "dormitory", name: "", gender: "any", capacity: "2" },
    );
    setRoomFormOpen(true);
  };

  const saveRoom = async () => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      await upsertRoom({
        sessionToken,
        roomId: editingRoom?._id as Id<"agcRooms"> | undefined,
        accommodationType: roomForm.accommodationType as (typeof TYPES)[number],
        name: roomForm.name,
        gender:
          roomForm.gender === "any" ? undefined : (roomForm.gender as "male" | "female"),
        capacity: Number(roomForm.capacity),
      });
      toast.success(editingRoom ? "Room updated" : "Room created");
      setRoomFormOpen(false);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not save room"));
    } finally {
      setBusy(false);
    }
  };

  const removeRoom = async (room: RoomRow) => {
    if (!sessionToken) return;
    try {
      await deleteRoom({ sessionToken, roomId: room._id as Id<"agcRooms"> });
      toast.success(`Deleted room ${room.name}`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not delete room"));
    }
  };

  const assign = async () => {
    if (!sessionToken || !assignRoom || assignPicks.length === 0) return;
    setBusy(true);
    try {
      const result = await assignGuests({
        sessionToken,
        roomId: assignRoom._id as Id<"agcRooms">,
        guestIds: assignPicks as Id<"agcGuests">[],
      });
      toast.success(`Assigned ${result.assigned} guest(s) to ${assignRoom.name}`);
      setAssignRoom(null);
      setAssignPicks([]);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Assignment failed"));
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (assignmentId: string) => {
    if (!sessionToken) return;
    try {
      await unassignGuest({
        sessionToken,
        assignmentId: assignmentId as Id<"agcRoomAssignments">,
      });
      toast.success("Guest removed from room");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not remove guest"));
    }
  };

  const runAutoAssign = async () => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const result = await autoAssign({ sessionToken });
      toast.success(
        `Auto-assigned ${result.placed} guest(s)` +
          (result.remaining > 0 ? ` — ${result.remaining} still unassigned (no free matching bed)` : ""),
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Auto-assign failed"));
    } finally {
      setBusy(false);
    }
  };

  /** Guest pool for the assignment dialog: matching type, not yet in a room. */
  const assignableGuests = useMemo(
    () =>
      assignRoom
        ? guests.filter(
            (g: UnassignedGuest) => g.accommodationType === assignRoom.accommodationType,
          )
        : [],
    [assignRoom, guests],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => openRoomForm(null)}>
          <BedDouble className="size-4" /> Add room
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || guests.length === 0 || list.length === 0}
          onClick={() => void runAutoAssign()}
        >
          <Sparkles className="size-4" /> Auto-assign guests ({guests.length})
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRoomingOpen(true)} disabled={list.length === 0}>
          <Printer className="size-4" /> Rooming list
        </Button>
        <span className="grow" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {usedBeds}/{totalBeds} beds filled · {guests.length} awaiting a room
        </span>
      </div>

      {list.length === 0 && (
        <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
          No rooms yet — add rooms per accommodation type, then assign guests
          (or use auto-assign). Only guests with confirmed bookings appear.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((room) => {
          const full = room.occupants >= room.capacity;
          return (
            <div key={room._id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{room.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL(room.accommodationType)}
                    {room.gender ? ` · ${room.gender} only` : ""}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "tabular-nums",
                    full
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700",
                  )}
                >
                  {room.occupants}/{room.capacity}
                </Badge>
              </div>
              {room.assignments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {room.assignments.map((a) => {
                    const guest = guests.find((g) => g._id === a.guestId);
                    return (
                      <li
                        key={a._id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate">
                          {guest?.name ?? a.guestId}
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remove guest from room"
                          onClick={() => void unassign(a._id)}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-3 flex items-center gap-1.5">
                {!full && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                      setAssignRoom(room);
                      setAssignPicks([]);
                    }}
                  >
                    <UserPlus className="size-3" /> Assign
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => openRoomForm(room)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                  disabled={room.occupants > 0}
                  onClick={() => void removeRoom(room)}
                >
                  <DoorOpen className="size-3" /> Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Room create/edit */}
      <Dialog open={roomFormOpen} onOpenChange={setRoomFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoom ? `Edit ${editingRoom.name}` : "Add room"}</DialogTitle>
            <DialogDescription>
              Rooms belong to an accommodation type and hold a fixed number of
              beds. A gender lock keeps shared rooms single-sex.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={roomForm.accommodationType}
                  onValueChange={(value) =>
                    setRoomForm({ ...roomForm, accommodationType: value ?? roomForm.accommodationType })
                  }
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{TYPE_LABEL(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Gender lock</Label>
                <Select
                  value={roomForm.gender}
                  onValueChange={(value) => setRoomForm({ ...roomForm, gender: value ?? roomForm.gender })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="male">Male only</SelectItem>
                    <SelectItem value="female">Female only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Room name</Label>
                <Input
                  value={roomForm.name}
                  placeholder="e.g. Dorm A-101"
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Beds</Label>
                <Input
                  type="number"
                  min={1}
                  value={roomForm.capacity}
                  onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoomFormOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={() => void saveRoom()}
                disabled={busy || !roomForm.name.trim()}
              >
                {editingRoom ? "Save changes" : "Create room"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Guest assignment */}
      <Dialog
        open={assignRoom !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssignRoom(null);
            setAssignPicks([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign guests to {assignRoom?.name}</DialogTitle>
            <DialogDescription>
              {assignRoom
                ? `${assignRoom.capacity - assignRoom.occupants} bed(s) free · ${TYPE_LABEL(assignRoom.accommodationType)}${assignRoom.gender ? ` · ${assignRoom.gender} only` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {assignableGuests.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No unassigned guests for this room&apos;s type.
              </p>
            ) : (
              assignableGuests.map((guest: UnassignedGuest) => {
                const checked = assignPicks.includes(guest._id);
                return (
                  <label
                    key={guest._id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
                      checked && "border-primary bg-primary/5",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setAssignPicks((picks) =>
                            e.target.checked
                              ? [...picks, guest._id]
                              : picks.filter((id) => id !== guest._id),
                          )
                        }
                      />
                      <span>{guest.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({guest.gender})
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {guest.hubName}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {assignPicks.length} selected ·{" "}
              {assignRoom ? assignRoom.capacity - assignRoom.occupants : 0} free
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAssignRoom(null);
                  setAssignPicks([]);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void assign()}
                disabled={busy || assignPicks.length === 0}
              >
                Assign {assignPicks.length || ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Printable rooming list */}
      <RoomingListDialog
        open={roomingOpen}
        onOpenChange={setRoomingOpen}
        typeFilter={roomingType}
        onTypeFilterChange={setRoomingType}
      />
    </div>
  );
}

function RoomingListDialog({
  open,
  onOpenChange,
  typeFilter,
  onTypeFilterChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
}) {
  const { sessionToken } = useAdminSession();
  const rooming = useQuery(
    api.agcRoomAssignments.getRoomingList,
    open && sessionToken
      ? {
          sessionToken,
          accommodationType:
            typeFilter === "all"
              ? undefined
              : (typeFilter as (typeof TYPES)[number]),
        }
      : "skip",
  );
  const rooms = rooming ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            Rooming list
            <span className="flex items-center gap-2 text-sm font-normal">
              <Select
                value={typeFilter}
                onValueChange={(value) => onTypeFilterChange(value ?? "all")}
              >
                <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{TYPE_LABEL(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="size-3.5" /> Print
              </Button>
            </span>
          </DialogTitle>
          <DialogDescription>
            Check-in handout — one row per room. Empty beds print as vacancies.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {rooms.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No rooms match this filter.
            </p>
          ) : (
            rooms.map((room: RoomingRoom) => (
              <div key={room._id} className="rounded-lg border p-3">
                <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
                  {room.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {room.typeLabel}
                    {room.gender ? ` · ${room.gender} only` : ""} ·{" "}
                    {room.occupants.length}/{room.capacity} beds
                  </span>
                </p>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 font-medium">Guest</th>
                      <th className="py-1 font-medium">Hub</th>
                      <th className="py-1 font-medium">Booking ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.occupants.map((guest) => (
                      <tr key={guest._id} className="border-b last:border-0">
                        <td className="py-1">{guest.name}</td>
                        <td className="py-1">{guest.hubName}</td>
                        <td className="py-1 font-mono">{guest.bookingRef || "—"}</td>
                      </tr>
                    ))}
                    {Array.from({
                      length: Math.max(0, room.capacity - room.occupants.length),
                    }).map((_, i) => (
                      <tr key={`empty-${i}`} className="border-b last:border-0 text-muted-foreground">
                        <td className="py-1 italic">(vacant)</td>
                        <td className="py-1" />
                        <td className="py-1" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
