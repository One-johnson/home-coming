"use client";

import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BedDouble,
  Download,
  DoorOpen,
  Eye,
  Printer,
  Sparkles,
  Trash2,
  Upload,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import { cn } from "@/lib/utils";

/**
 * Room management + assignment screen (Phase 2 §3–§9): Excel physical
 * inventory import, capacity/gender validation, bulk assignment, change
 * history, and publishing for the rep portal.
 */

type RoomRow = {
  _id: string;
  accommodationType: string;
  name: string;
  building: string | null;
  gender: string | null;
  capacity: number;
  note: string | null;
  publishedAt: number | null;
  publishedBy: string | null;
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
  building: string | null;
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

type HistoryRow = {
  _id: string;
  guestName: string;
  assignedBy: string;
  createdAt: number;
  endedAt: string | number | null;
  endBy: string | null;
  endReason: string | null;
};

type ImportPreview = {
  accommodationType: string;
  newRooms: number;
  updatedRooms: number;
  capacity: number;
  poolTotal: number;
  withinPool: boolean;
};

type ImportRow = {
  accommodationType: "dormitory" | "hostel" | "wise_serpents" | "good_general" | "ebpv";
  building?: string;
  name: string;
  capacity: number;
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
  const publishRooms = useMutation(api.agcRoomAssignments.publishRooms);
  const parseImport = useAction(api.agcRoomsImport.parseRoomImportWorkbook);
  const generateTemplate = useAction(api.agcRoomsImport.generateRoomImportTemplate);
  const importRoomsMutation = useMutation(api.agcRoomAssignments.importRooms);

  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomRow | null>(null);
  const [roomForm, setRoomForm] = useState({
    accommodationType: "dormitory",
    name: "",
    building: "",
    gender: "any",
    capacity: "2",
  });
  const [assignRoom, setAssignRoom] = useState<RoomRow | null>(null);
  const [assignPicks, setAssignPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [roomingOpen, setRoomingOpen] = useState(false);
  const [roomingType, setRoomingType] = useState<string>("all");
  const [publishScopeValue, setPublishScopeValue] = useState("");

  // Unassigned-queue filters (§5)
  const [guestFilter, setGuestFilter] = useState("");
  const [guestHub, setGuestHub] = useState("all");
  const [guestGender, setGuestGender] = useState("all");
  const [guestType, setGuestType] = useState("all");

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [invalidRows, setInvalidRows] = useState<{ row: number; reason: string }[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);

  // History drawer
  const [historyRoom, setHistoryRoom] = useState<RoomRow | null>(null);
  const history = useQuery(
    api.agcRoomAssignments.getRoomHistory,
    sessionToken && historyRoom
      ? { sessionToken, roomId: historyRoom._id as Id<"agcRooms"> }
      : "skip",
  );

  const list = useMemo(() => rooms ?? [], [rooms]);
  const guests = useMemo(() => unassigned ?? [], [unassigned]);
  const totalBeds = list.reduce((sum, room) => sum + room.capacity, 0);
  const usedBeds = list.reduce((sum, room) => sum + room.occupants, 0);

  const buildings = useMemo(
    () => [...new Set(list.map((room) => room.building).filter(Boolean) as string[])],
    [list],
  );
  const hubs = useMemo(
    () => [...new Set(guests.map((g) => g.hubName))],
    [guests],
  );

  const filteredGuests = useMemo(() => {
    const term = guestFilter.trim().toLowerCase();
    return guests.filter((g) => {
      if (guestHub !== "all" && g.hubName !== guestHub) return false;
      if (guestGender !== "all" && g.gender !== guestGender) return false;
      if (guestType !== "all" && g.accommodationType !== guestType) return false;
      if (term && !`${g.name}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [guests, guestFilter, guestHub, guestGender, guestType]);

  const openRoomForm = (room: RoomRow | null) => {
    setEditingRoom(room);
    setRoomForm(
      room
        ? {
            accommodationType: room.accommodationType,
            name: room.name,
            building: room.building ?? "",
            gender: room.gender ?? "any",
            capacity: String(room.capacity),
          }
        : { accommodationType: "dormitory", name: "", building: "", gender: "any", capacity: "2" },
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
        building: roomForm.building.trim() || undefined,
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

  const publish = async (request: {
    roomIds?: string[];
    building?: string;
    accommodationType?: string;
    all?: boolean;
    publish: boolean;
    label: string;
  }) => {
    if (!sessionToken) return;
    setBusy(true);
    try {
      const result = await publishRooms({
        sessionToken,
        roomIds: request.roomIds
          ? (request.roomIds as Id<"agcRooms">[])
          : undefined,
        building: request.building,
        accommodationType: request.accommodationType as (typeof TYPES)[number] | undefined,
        all: request.all,
        publish: request.publish,
      });
      if (result.count === 0) {
        toast.info(
          `${request.label} — nothing to change, those ${result.matched} room(s) were already ${request.publish ? "published" : "unpublished"}.`,
        );
      } else {
        toast.success(
          request.publish
            ? `Published ${result.count} room(s) — reps can now see them.`
            : `Unpublished ${result.count} room(s) — reps can no longer see them.`,
        );
      }
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Publish failed"));
    } finally {
      setBusy(false);
    }
  };

  /** Bulk publish scopes from the "Publish…" menu (all, a type, or a block). */
  const publishScope = async (scope: string) => {
    if (!scope) return;
    if (scope === "all") {
      await publish({ all: true, publish: true, label: "Publish all rooms" });
    } else if (scope.startsWith("type:")) {
      const type = scope.slice("type:".length);
      await publish({
        accommodationType: type,
        publish: true,
        label: `Publish all ${TYPE_LABEL(type)} rooms`,
      });
    } else if (scope.startsWith("building:")) {
      const building = scope.slice("building:".length);
      await publish({ building, publish: true, label: `Publish ${building}` });
    }
  };

  const downloadTemplate = async () => {
    if (!sessionToken) return;
    try {
      const result = await generateTemplate({ sessionToken });
      downloadBase64(result.filename, result.contentBase64);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not generate template"));
    }
  };

  const parseImportFile = async (file: File) => {
    if (!sessionToken) return;
    setBusy(true);
    setImportRows(null);
    setInvalidRows([]);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(String(reader.result ?? "").split(",")[1] ?? "");
        };
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      const parsed = await parseImport({ sessionToken, contentBase64 });
      setImportRows(parsed.rows);
      setInvalidRows(parsed.invalidRows);
      // The dry-run preview renders automatically via previewRoomImport.
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not parse the workbook"));
    } finally {
      setBusy(false);
    }
  };

  /** Dry-run preview — same validation the commit runs (pool caps etc.). */
  const previewRows = useQuery(
    api.agcRoomAssignments.previewRoomImport,
    sessionToken && importRows
      ? {
          sessionToken,
          rows: importRows.map((row) => ({
            accommodationType: row.accommodationType,
            building: row.building,
            name: row.name,
            capacity: row.capacity,
          })),
        }
      : "skip",
  );

  const commitImport = async () => {
    if (!sessionToken || !importRows || importRows.length === 0) return;
    setBusy(true);
    try {
      const result = await importRoomsMutation({
        sessionToken,
        rows: importRows.map((row) => ({
          accommodationType: row.accommodationType,
          building: row.building,
          name: row.name,
          capacity: row.capacity,
        })),
      });
      toast.success(`Imported: ${result.created} new, ${result.updated} updated rooms.`);
      setImportOpen(false);
      setImportRows(null);
      setInvalidRows([]);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Import failed"));
    } finally {
      setBusy(false);
    }
  };

  function downloadBase64(filename: string, contentBase64: string) {
    const binary = atob(contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" /> Import inventory
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
        <Select
          value={publishScopeValue}
          onValueChange={(value) => {
            const scope = typeof value === "string" ? value : "";
            setPublishScopeValue(scope);
            void publishScope(scope);
            setPublishScopeValue("");
          }}
          disabled={busy || list.length === 0}
        >
          <SelectTrigger className="h-9 w-56" aria-label="Publish rooms in bulk">
            <SelectValue placeholder="Publish…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Publish all {list.length} room(s)
            </SelectItem>
            {TYPES.filter((type) =>
              list.some((room) => room.accommodationType === type),
            ).map((type) => (
              <SelectItem key={type} value={`type:${type}`}>
                Publish all {TYPE_LABEL(type)} (
                {list.filter((room) => room.accommodationType === type).length})
              </SelectItem>
            ))}
            {buildings.map((building) => (
              <SelectItem key={building} value={`building:${building}`}>
                Publish block — {building}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="grow" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {usedBeds}/{totalBeds} {list.some((r) => r.accommodationType === "ebpv") ? "spaces" : "beds"} filled · {guests.length} awaiting a room
        </span>
      </div>

      {list.length === 0 && (
        <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
          No rooms yet — import the physical inventory from Excel, add rooms
          manually, then assign guests (or use auto-assign).
        </p>
      )}

      {/* Unassigned delegates (§5A) */}
      <div className="rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Unassigned delegates ({filteredGuests.length})</p>
          <Input
            placeholder="Name…"
            className="h-8 w-40"
            value={guestFilter}
            onChange={(e) => setGuestFilter(e.target.value)}
          />
          <Select value={guestHub} onValueChange={(value) => setGuestHub(value ?? "all")}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All hubs</SelectItem>
              {hubs.map((hub) => (
                <SelectItem key={hub} value={hub}>{hub}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={guestGender} onValueChange={(value) => setGuestGender(value ?? "all")}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any gender</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
          <Select value={guestType} onValueChange={(value) => setGuestType(value ?? "all")}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((type) => (
                <SelectItem key={type} value={type}>{TYPE_LABEL(type)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filteredGuests.length > 0 && (
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
            {filteredGuests.slice(0, 60).map((guest) => (
              <li key={guest._id} className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{guest.name}</span>
                  <span className="text-muted-foreground">
                    {guest.hubName} · {guest.gender} · {TYPE_LABEL(guest.accommodationType)}
                  </span>
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {guest.bookingRef || "—"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((room) => {
          const full = room.occupants >= room.capacity;
          const isApartment = room.accommodationType === "ebpv";
          const published = room.publishedAt != null;
          return (
            <div key={room._id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{room.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL(room.accommodationType)}
                    {room.building ? ` · ${room.building}` : ""}
                    {room.gender ? ` · ${room.gender} only` : isApartment ? " · mixed" : ""}
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
              {isApartment && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Apartment — occupants choose their rooms; keys go to the first arrival (§7).
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-1.5">
                {published ? (
                  <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
                    Published to reps
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Unpublished
                  </Badge>
                )}
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() =>
                    void publish({
                      roomIds: [room._id],
                      publish: !room.publishedAt,
                      label: room.name,
                    })
                  }
                >
                  {published ? "unpublish" : "publish"}
                </button>
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
                  className="h-7 gap-1 text-xs"
                  onClick={() => setHistoryRoom(room)}
                >
                  <Eye className="size-3" /> History
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
              beds. A gender lock keeps shared rooms single-sex. EBPV apartments
              hold at most 4 delegates (§7).
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
                <Label>Building / block</Label>
                <Input
                  value={roomForm.building}
                  placeholder="e.g. Blocks 1–4"
                  onChange={(e) => setRoomForm({ ...roomForm, building: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1.5">
                <Label>Room name</Label>
                <Input
                  value={roomForm.name}
                  placeholder={roomForm.accommodationType === "ebpv" ? "e.g. Apartment 1" : "e.g. Room 101"}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{roomForm.accommodationType === "ebpv" ? "Delegates (max 4)" : "Beds"}</Label>
                <Input
                  type="number"
                  min={1}
                  max={roomForm.accommodationType === "ebpv" ? 4 : undefined}
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
                ? `${assignRoom.capacity - assignRoom.occupants} ${assignRoom.accommodationType === "ebpv" ? "delegate space(s)" : "bed(s)"} free · ${TYPE_LABEL(assignRoom.accommodationType)}${assignRoom.gender ? ` · ${assignRoom.gender} only` : ""}`
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

      {/* Import inventory */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import physical room inventory (§3)</DialogTitle>
            <DialogDescription>
              Upload the inventory workbook as the accommodation team keeps it:
              one sheet per accommodation type, a title row, then the room number
              / apartment name and capacity headers with one room per row. Staff
              assign and check in delegates manually, so no gender column is
              needed. Imports never exceed the confirmed inventory pools.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void downloadTemplate()}>
                <Download className="size-4" /> Template
              </Button>
              <Input
                ref={importFileRef}
                type="file"
                accept=".xlsx"
                className="max-w-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void parseImportFile(file);
                }}
              />
              {busy && <Loader2 />}
            </div>
            {invalidRows.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                {invalidRows.map((bad) => (
                  <p key={bad.row}>
                    Row {bad.row}: {bad.reason}
                  </p>
                ))}
              </div>
            )}
            {previewRows && (
              <div className="rounded-lg border p-2 text-xs">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location</TableHead>
                      <TableHead>New</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead>Spaces</TableHead>
                      <TableHead>Pool total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row: ImportPreview) => (
                      <TableRow key={row.accommodationType}>
                        <TableCell>{TYPE_LABEL(row.accommodationType)}</TableCell>
                        <TableCell className="tabular-nums">{row.newRooms}</TableCell>
                        <TableCell className="tabular-nums">{row.updatedRooms}</TableCell>
                        <TableCell className="tabular-nums">{row.capacity}</TableCell>
                        <TableCell className="tabular-nums">{row.poolTotal}</TableCell>
                        <TableCell>
                          {row.withinPool ? (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
                              Exceeds pool
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button
                onClick={() => void commitImport()}
                disabled={busy || !importRows || importRows.length === 0}
              >
                Import {importRows?.length ?? 0} rows
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History drawer */}
      <Dialog open={historyRoom !== null} onOpenChange={(open) => !open && setHistoryRoom(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>History — {historyRoom?.name}</DialogTitle>
            <DialogDescription>
              Every assignment, move and removal is preserved (§9).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delegate</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                      No assignments recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  ((history ?? []) as HistoryRow[]).map((row) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.guestName}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(row.createdAt).toLocaleString()} · {row.assignedBy}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.endedAt ? new Date(row.endedAt).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{row.endReason ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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

function Loader2() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Loading" />;
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
                    {room.building ? ` · ${room.building}` : ""}
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
