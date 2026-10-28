"use client";

import { useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BedDouble,
  ChevronDown,
  Download,
  DoorOpen,
  Eye,
  Flag,
  Loader2Icon,
  Lock,
  Printer,
  Sparkles,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  UserPlus,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { BulkAssignPanel } from "@/components/admin/agc/BulkAssignPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  /** Desk reservation: not assignable until released. */
  hold: { note: string; by: string; at: number } | null;
  /** Out of inventory while a blocking fault is open. */
  faulty: boolean;
  openIssues: number;
  occupants: number;
  assignments: { _id: string; guestId: string; bookingId: string }[];
};

/** One room-maintenance flag as the rooms screen reads it. */
type RoomIssueRow = {
  _id: string;
  roomId: string;
  roomName: string;
  accommodationType: string;
  building: string | null;
  category: string;
  note: string;
  blocksRoom: boolean;
  status: string;
  reportedAt: number;
  reportedBy: string;
  resolvedAt: number | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
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
  duplicateRows: number;
  duplicateRooms: number;
};

type ImportRow = {
  accommodationType: "dormitory" | "hostel" | "wise_serpents" | "good_general" | "ebpv";
  building?: string;
  name: string;
  capacity: number;
};

const TYPES = ["dormitory", "hostel", "wise_serpents", "good_general", "ebpv"] as const;

/** Room problems the team actually raises on site, in the order they check.
 * The fallback covers a value written by an older build. */
const ISSUE_CATEGORIES = [
  "toilet",
  "water",
  "electrical",
  "door_lock",
  "cleaning",
  "other",
] as const;
const ISSUE_LABEL: Record<string, string> = {
  toilet: "Toilet",
  water: "Water",
  electrical: "Electrical",
  door_lock: "Door / lock",
  cleaning: "Cleaning",
  other: "Other",
};

type RoomView = "all" | "published" | "unpublished";
const TYPE_LABEL = (type: string) =>
  AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;

/**
 * A room's past faults, folded away by default. Open problems stay loud on the
 * card; this is the record of what was already fixed, so the room team can tell
 * a room with one old repair from one that keeps breaking. A category that
 * comes back is named next to the count instead of being left for someone to
 * notice across three separate entries.
 */
function RoomFaultHistory({ issues }: { issues: RoomIssueRow[] }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;

  const sorted = [...issues].sort(
    (a, b) => (b.resolvedAt ?? b.reportedAt) - (a.resolvedAt ?? a.reportedAt),
  );
  const counts = new Map<string, number>();
  for (const issue of sorted) {
    counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1);
  }
  const recurring = [...counts.entries()].filter(([, count]) => count > 1);
  const shown = sorted.slice(0, 6);

  return (
    <div className="mt-2 text-[11px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full flex-wrap items-center gap-1 text-left text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            !open && "-rotate-90",
          )}
        />
        Fault history ({sorted.length})
        {recurring.length > 0 && (
          <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            recurring:{" "}
            {recurring
              .map(([category, count]) => `${ISSUE_LABEL[category] ?? category} ×${count}`)
              .join(" · ")}
          </span>
        )}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5 border-l pl-2">
          {shown.map((issue) => (
            <li key={issue._id} className="text-muted-foreground">
              <p className="leading-snug">
                <span className="font-medium text-foreground">
                  {ISSUE_LABEL[issue.category] ?? issue.category}
                </span>
                {issue.blocksRoom ? " · out of inventory" : ""} — {issue.note}
              </p>
              <p>
                Fixed {new Date(issue.resolvedAt ?? issue.reportedAt).toLocaleDateString()}
                {issue.resolvedBy ? ` by ${issue.resolvedBy}` : ""}
                {issue.resolutionNote ? ` — ${issue.resolutionNote}` : ""}
              </p>
            </li>
          ))}
          {sorted.length > shown.length && (
            <li className="text-muted-foreground">
              +{sorted.length - shown.length} earlier fault
              {sorted.length - shown.length === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function RoomsTab() {
  const { sessionToken, user } = useAdminSession();
  // Raising a problem is for everyone who walks the rooms; closing one is the
  // accommodation team's call (mirrors the server-side role gate).
  const canFixIssues =
    user?.role === "admin" ||
    user?.role === "accommodation" ||
    user?.role === "room_assignment";
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
  const roomingSettings = useQuery(
    api.agcRoomAssignments.getRoomingSettings,
    sessionToken ? { sessionToken } : "skip",
  );
  // Fixed flags come along too: a room repaired three times in a month is a
  // different proposition from one with a single old repair, and the card's
  // fault history is where the room team sees that.
  const roomIssues = useQuery(
    api.agcRoomIssues.listRoomIssues,
    sessionToken ? { sessionToken, includeFixed: true } : "skip",
  );
  const flagRoomIssue = useMutation(api.agcRoomIssues.flagRoom);
  const resolveRoomIssue = useMutation(api.agcRoomIssues.resolveRoomIssue);
  const holdRoom = useMutation(api.agcRoomAssignments.holdRoom);
  const releaseRoomHold = useMutation(api.agcRoomAssignments.releaseRoomHold);
  const addWalkIn = useMutation(api.agcRoomAssignments.addWalkInDelegate);
  const roomingOverview = useQuery(
    api.agcRoomAssignments.getRoomingOverview,
    sessionToken ? { sessionToken } : "skip",
  );
  const hubs = useQuery(api.agcAdminData.listActiveHubs, {});
  const publishRooms = useMutation(api.agcRoomAssignments.publishRooms);
  const deleteRooms = useMutation(api.agcRoomAssignments.deleteRooms);
  const restoreRooms = useMutation(api.agcRoomAssignments.restoreRooms);
  const deletedRooms = useQuery(
    api.agcRoomAssignments.listDeletedRoomsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
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
  /** True while the assign panel's phone bar is on screen (see BulkAssignPanel). */
  const [assignBarActive, setAssignBarActive] = useState(false);

  // Room maintenance flag dialog
  const [flagTarget, setFlagTarget] = useState<RoomRow | null>(null);
  const [flagCategory, setFlagCategory] =
    useState<(typeof ISSUE_CATEGORIES)[number]>("toilet");
  const [flagNote, setFlagNote] = useState("");
  const [flagBlocksRoom, setFlagBlocksRoom] = useState(true);
  const [flagBusy, setFlagBusy] = useState(false);

  // Room reservation (hold) dialog
  const [holdTarget, setHoldTarget] = useState<RoomRow | null>(null);
  const [holdNote, setHoldNote] = useState("");
  const [holdBusy, setHoldBusy] = useState(false);

  // Last-minute delegate (a volunteer who is not in the system)
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [walkIn, setWalkIn] = useState({
    hubId: "",
    title: "Member",
    firstName: "",
    lastName: "",
    gender: "male" as "male" | "female",
    accommodationType: "dormitory" as (typeof TYPES)[number],
    note: "",
  });
  const [publishScopeValue, setPublishScopeValue] = useState("");

  // Bulk delete dialog
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");

  // Restore (undo delete) dialog
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restorePicks, setRestorePicks] = useState<string[]>([]);
  const [roomView, setRoomView] = useState<RoomView>("all");
  const [roomSearch, setRoomSearch] = useState("");
  /** Accordion: one group open at a time. undefined = pick the first match. */
  const [openGroup, setOpenGroup] = useState<string | null | undefined>(undefined);

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
  // undefined = still loading; an empty array is a genuinely empty inventory.
  const loadingRooms = rooms === undefined;
  const loadingGuests = unassigned === undefined;
  const autoAssignEnabled = roomingSettings?.autoAssignEnabled ?? false;

  /**
   * Per-room flags, split by state: open problems stay loud on the card, fixed
   * ones fold into its fault history.
   */
  const { openIssuesByRoom, faultHistoryByRoom } = useMemo(() => {
    const open = new Map<string, RoomIssueRow[]>();
    const history = new Map<string, RoomIssueRow[]>();
    for (const issue of roomIssues?.issues ?? []) {
      const target = issue.status === "open" ? open : history;
      const listForRoom = target.get(issue.roomId) ?? [];
      listForRoom.push(issue);
      target.set(issue.roomId, listForRoom);
    }
    return { openIssuesByRoom: open, faultHistoryByRoom: history };
  }, [roomIssues]);
  const totalBeds = list.reduce((sum, room) => sum + room.capacity, 0);
  const usedBeds = list.reduce((sum, room) => sum + room.occupants, 0);

  // Rooms grouped under a heading per accommodation type, narrowed by the
  // search box and the published / unpublished filter.
  const roomGroups = useMemo(() => {
    const term = roomSearch.trim().toLowerCase();
    return TYPES.map((type) => {
      const allRooms = list.filter((room) => room.accommodationType === type);
      const shown = allRooms.filter((room) => {
        if (roomView === "published" && room.publishedAt == null) return false;
        if (roomView === "unpublished" && room.publishedAt != null) return false;
        if (!term) return true;
        return `${room.name} ${room.building ?? ""}`.toLowerCase().includes(term);
      });
      return { type, rooms: shown, allRooms };
    }).filter((group) => group.rooms.length > 0);
  }, [list, roomView, roomSearch]);

  const matchedRooms = roomGroups.reduce((sum, group) => sum + group.rooms.length, 0);
  const activeGroup =
    openGroup === undefined ? (roomGroups[0]?.type ?? null) : openGroup;

  /** Opening the group that is already open closes it; another opens alone. */
  const toggleGroup = (type: string) =>
    setOpenGroup(activeGroup === type ? null : type);

  const publishedCount = list.filter((room) => room.publishedAt != null).length;

  const deleteTargets = useMemo(() => {
    if (deleteScope === "all") return list;
    if (deleteScope.startsWith("type:")) {
      const type = deleteScope.slice("type:".length);
      return list.filter((room) => room.accommodationType === type);
    }
    if (deleteScope.startsWith("building:")) {
      const building = deleteScope.slice("building:".length);
      return list.filter((room) => room.building === building);
    }
    return [];
  }, [deleteScope, list]);
  const deletableRooms = deleteTargets.filter((room) => room.occupants === 0);
  const occupiedInDeleteScope = deleteTargets.length - deletableRooms.length;

  const deletedList = deletedRooms?.rooms ?? [];
  const restorablePicks = deletedList.filter(
    (room) => !room.nameTaken && restorePicks.includes(room._id),
  ).length;

  const buildings = useMemo(
    () => [...new Set(list.map((room) => room.building).filter(Boolean) as string[])],
    [list],
  );
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
    if (!autoAssignEnabled) {
      toast.info(
        "Auto-assign is turned off — a super admin can enable it in Settings → Operations.",
      );
      return;
    }
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

  const submitFlag = async () => {
    if (!sessionToken || !flagTarget) return;
    if (!flagNote.trim()) {
      toast.error("Describe the problem so maintenance knows what to fix.");
      return;
    }
    setFlagBusy(true);
    try {
      const result = await flagRoomIssue({
        sessionToken,
        roomId: flagTarget._id as Id<"agcRooms">,
        category: flagCategory,
        note: flagNote.trim(),
        blocksRoom: flagBlocksRoom,
      });
      toast.success(
        result.created
          ? flagBlocksRoom
            ? `Flagged ${flagTarget.name} — out of inventory until the fault is fixed.`
            : `Flagged ${flagTarget.name} — the room team sees it on this card.`
          : `${flagTarget.name} already has that flag open.`,
      );
      setFlagTarget(null);
      setFlagNote("");
      setFlagCategory("toilet");
      setFlagBlocksRoom(true);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not flag this room"));
    } finally {
      setFlagBusy(false);
    }
  };

  const markRoomFixed = async (issueId: string, roomName: string) => {
    if (!sessionToken) return;
    try {
      await resolveRoomIssue({
        sessionToken,
        issueId: issueId as Id<"agcRoomIssues">,
      });
      toast.success(`Marked fixed on ${roomName} — the flag stays in the log.`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not update the flag"));
    }
  };

  const submitHold = async () => {
    if (!sessionToken || !holdTarget) return;
    if (!holdNote.trim()) {
      toast.error("Say why the room is being reserved — the desk sees this note.");
      return;
    }
    setHoldBusy(true);
    try {
      await holdRoom({
        sessionToken,
        roomId: holdTarget._id as Id<"agcRooms">,
        note: holdNote.trim(),
      });
      toast.success(`${holdTarget.name} reserved — it stays out of assignment until released.`);
      setHoldTarget(null);
      setHoldNote("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not reserve the room"));
    } finally {
      setHoldBusy(false);
    }
  };

  const releaseHold = async (room: RoomRow) => {
    if (!sessionToken) return;
    try {
      await releaseRoomHold({ sessionToken, roomId: room._id as Id<"agcRooms"> });
      toast.success(`${room.name} released back into inventory.`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not release the room"));
    }
  };

  const submitWalkIn = async () => {
    if (!sessionToken) return;
    if (!walkIn.hubId) {
      toast.error("Choose the hub this delegate belongs to.");
      return;
    }
    if (!walkIn.firstName.trim() || !walkIn.lastName.trim()) {
      toast.error("First and last name are both required.");
      return;
    }
    setWalkInBusy(true);
    try {
      const result = await addWalkIn({
        sessionToken,
        hubId: walkIn.hubId as Id<"agcHubs">,
        title: walkIn.title.trim() || undefined,
        firstName: walkIn.firstName.trim(),
        lastName: walkIn.lastName.trim(),
        gender: walkIn.gender,
        accommodationType: walkIn.accommodationType,
        note: walkIn.note.trim() || undefined,
      });
      toast.success(
        `${walkIn.firstName.trim()} ${walkIn.lastName.trim()} added (${result.referenceNumber}) — now in the unassigned list.`,
      );
      setWalkInOpen(false);
      setWalkIn({
        hubId: walkIn.hubId,
        title: "Member",
        firstName: "",
        lastName: "",
        gender: "male",
        accommodationType: "dormitory",
        note: "",
      });
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not add the delegate"));
    } finally {
      setWalkInBusy(false);
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
  const runBulkDelete = async () => {
    if (!sessionToken || !deleteScope || deleteConfirm !== "DELETE") return;
    setBusy(true);
    try {
      const scope =
        deleteScope === "all"
          ? { all: true }
          : deleteScope.startsWith("type:")
            ? {
                accommodationType: deleteScope.slice(
                  "type:".length,
                ) as (typeof TYPES)[number],
              }
            : { building: deleteScope.slice("building:".length) };
      const result = await deleteRooms({ sessionToken, ...scope });
      toast.success(
        `Deleted ${result.deleted} room(s)` +
          (result.kept > 0
            ? ` — kept ${result.kept} that still hold delegates`
            : ""),
      );
      setBulkDeleteOpen(false);
      setDeleteScope("");
      setDeleteConfirm("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk delete failed"));
    } finally {
      setBusy(false);
    }
  };

  const runRestore = async () => {
    if (!sessionToken || restorablePicks === 0) return;
    setBusy(true);
    try {
      const result = await restoreRooms({
        sessionToken,
        roomIds: restorePicks as Id<"agcRooms">[],
      });
      toast.success(
        `Restored ${result.restored} room(s)` +
          (result.conflictCount > 0
            ? ` — skipped ${result.conflictCount} whose name is back in use`
            : ""),
      );
      setRestoreOpen(false);
      setRestorePicks([]);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Restore failed"));
    } finally {
      setBusy(false);
    }
  };

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
      const summary = [`${result.created} new`, `${result.updated} updated`];
      if (result.removed > 0) summary.push(`${result.removed} duplicate(s) removed`);
      if (result.keptOccupied > 0) {
        summary.push(`${result.keptOccupied} duplicate(s) kept — guests still roomed there`);
      }
      toast.success(`Imported: ${summary.join(", ")}.`);
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
    // The phone assign bar is fixed to the viewport, so the page — not just
    // the panel — has to end above it or the last room's buttons sit under it.
    // The padding follows the bar: no bar, no dead space at the end.
    <div className={cn("space-y-4", assignBarActive && "max-lg:pb-28")}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => openRoomForm(null)}>
          <BedDouble className="size-4" /> Add room
        </Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="size-4" /> Import inventory
        </Button>
        <Button size="sm" variant="outline" onClick={() => setWalkInOpen(true)}>
          <UserPlus className="size-4" /> Add last-minute delegate
        </Button>
        {/* Auto rooming stays visible but inactive until a super admin arms
            it in Settings, so the shortcut is discoverable without ever
            filling beds by default. */}
        <Button
          size="sm"
          variant="outline"
          disabled={
            busy || guests.length === 0 || list.length === 0 || !autoAssignEnabled
          }
          title={
            autoAssignEnabled
              ? "Fill every free bed from the matching queue"
              : "Turned off — a super admin can enable it in Settings → Operations"
          }
          onClick={() => void runAutoAssign()}
        >
          <Sparkles className="size-4" /> Auto-assign guests ({guests.length})
        </Button>
        {roomingSettings && !autoAssignEnabled && (
          <span className="text-[11px] text-muted-foreground">
            Off — enable in Settings → Operations
          </span>
        )}
        <Button size="sm" variant="outline" onClick={() => setRoomingOpen(true)} disabled={list.length === 0}>
          <Printer className="size-4" /> Rooming list
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-destructive hover:text-destructive"
          onClick={() => setBulkDeleteOpen(true)}
          disabled={busy || list.length === 0}
        >
          <Trash2 className="size-4" /> Bulk delete
        </Button>
        {deletedList.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRestorePicks([]);
              setRestoreOpen(true);
            }}
            disabled={busy}
          >
            <Undo2 className="size-4" /> Restore deleted (
            {deletedRooms?.total ?? deletedList.length})
          </Button>
        )}
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
        <Input
          placeholder="Search room or building…"
          aria-label="Search rooms"
          className="h-9 w-48"
          value={roomSearch}
          onChange={(e) => {
            setRoomSearch(e.target.value);
            // Re-open the first group that matches what is being searched.
            setOpenGroup(undefined);
          }}
        />
        <Select
          value={roomView}
          onValueChange={(value) => {
            setRoomView((value ?? "all") as RoomView);
            setOpenGroup(undefined);
          }}
        >
          <SelectTrigger className="h-9 w-44" aria-label="Filter rooms by publish state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rooms ({list.length})</SelectItem>
            <SelectItem value="published">Published ({publishedCount})</SelectItem>
            <SelectItem value="unpublished">
              Unpublished ({list.length - publishedCount})
            </SelectItem>
          </SelectContent>
        </Select>
        <span className="grow" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {loadingRooms
            ? "Loading rooms…"
            : `${usedBeds}/${totalBeds} ${list.some((r) => r.accommodationType === "ebpv") ? "spaces" : "beds"} filled · ${guests.length} awaiting a room`}
          {!loadingRooms && roomSearch.trim() ? ` · ${matchedRooms} match(es)` : ""}
          {(roomIssues?.openCount ?? 0) > 0
            ? ` · ${roomIssues?.openCount} open flag(s)`
            : ""}
        </span>
      </div>

      {/* The numbers the room team asks for first: what is free, what is held,
          what is out of service, and how the keys stand. */}
      {roomingOverview && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              label: "Available",
              value: roomingOverview.availableBeds,
              hint: `${roomingOverview.availableRooms} room(s) with a free bed`,
              tone: "text-emerald-700 dark:text-emerald-400",
            },
            {
              label: "Reserved",
              value: roomingOverview.reservedRooms,
              hint: `${roomingOverview.reservedBeds} bed(s) held back`,
              tone: "text-sky-700 dark:text-sky-400",
            },
            {
              label: "Faulty",
              value: roomingOverview.faultyRooms,
              hint: "Out of inventory until fixed",
              tone: "text-rose-700 dark:text-rose-400",
            },
            {
              label: "Occupied",
              value: roomingOverview.occupiedBeds,
              hint: `of ${roomingOverview.totalBeds} bed(s) in ${roomingOverview.totalRooms} room(s)`,
              tone: "text-foreground",
            },
            {
              label: "Awaiting a room",
              value: roomingOverview.awaitingRoom,
              hint: "Roomable delegates with no bed",
              tone: roomingOverview.awaitingRoom > 0 ? "text-amber-700 dark:text-amber-400" : "text-foreground",
            },
            {
              label: "Keys",
              value: `${roomingOverview.keysOut} out`,
              hint: `${roomingOverview.keysReturned} returned`,
              tone: "text-foreground",
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border bg-card px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              <p className={cn("text-lg font-semibold tabular-nums", stat.tone)}>
                {stat.value}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{stat.hint}</p>
            </div>
          ))}
        </div>
      )}

      {loadingRooms ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading rooms">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-10" />
              </div>
              <Skeleton className="mt-2 h-3 w-36" />
              <Skeleton className="mt-3 h-7 w-40" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
          No rooms yet — import the physical inventory from Excel, add rooms
          manually, then assign guests.
        </p>
      ) : null}

      {/* Bulk assignment (§5A/§6) — tick delegates, pick a room, assign. */}
      {loadingGuests ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <BulkAssignPanel
          guests={guests}
          rooms={list}
          onPickerActiveChange={setAssignBarActive}
        />
      )}

      {list.length > 0 && roomGroups.length === 0 && (
        <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {roomSearch.trim()
            ? `No room matches “${roomSearch.trim()}”.`
            : `No ${roomView === "published" ? "published" : "unpublished"} rooms — switch the filter to see the rest.`}
        </p>
      )}

      <div className="space-y-4">
        {roomGroups.map((group) => {
          const isOpen = activeGroup === group.type;
          const groupPublished = group.allRooms.filter(
            (room) => room.publishedAt != null,
          ).length;
          const groupBeds = group.allRooms.reduce((sum, room) => sum + room.capacity, 0);
          const groupFilled = group.allRooms.reduce((sum, room) => sum + room.occupants, 0);
          const panelId = `room-group-${group.type}`;
          return (
            <section key={group.type} className="rounded-xl border">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.type)}
                className={cn(
                  "sticky top-16 z-20 flex w-full flex-wrap items-center gap-2 rounded-t-xl bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60",
                  isOpen && "border-b",
                )}
              >
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform duration-300 ease-out",
                    !isOpen && "-rotate-90",
                  )}
                />
                <span className="text-sm font-medium">{TYPE_LABEL(group.type)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {group.rooms.length} room(s)
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {groupPublished}/{group.allRooms.length} published · {groupFilled} /
                  {groupBeds} filled
                </span>
              </button>
              <div
                id={panelId}
                aria-hidden={!isOpen}
                inert={!isOpen}
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.rooms.map((room) => {
          const full = room.occupants >= room.capacity;
          const isApartment = room.accommodationType === "ebpv";
          const published = room.publishedAt != null;
          return (
            <div key={room._id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{room.name}</p>
                  {(room.building || room.gender || isApartment) && (
                    <p className="text-xs text-muted-foreground">
                      {[
                        room.building,
                        room.gender ? `${room.gender} only` : isApartment ? "mixed" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
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
              {(room.faulty || room.hold) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {room.faulty && (
                    <Badge
                      variant="outline"
                      className="border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    >
                      <Wrench className="size-2.5" /> Out of inventory — faulty
                    </Badge>
                  )}
                  {room.hold && (
                    <Badge
                      variant="outline"
                      className="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                    >
                      <Lock className="size-2.5" /> Reserved
                    </Badge>
                  )}
                </div>
              )}
              {room.hold && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {room.hold.note} — {room.hold.by},{" "}
                  {new Date(room.hold.at).toLocaleDateString()}
                </p>
              )}
              {(openIssuesByRoom.get(room._id) ?? []).map((issue) => (
                <div
                  key={issue._id}
                  className="mt-2 rounded-lg border border-l-4 border-rose-200 bg-rose-50/70 px-2 py-1.5 text-[11px] text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200"
                >
                  <p className="flex flex-wrap items-center gap-1 font-medium">
                    <Wrench className="size-3 shrink-0" />
                    {ISSUE_LABEL[issue.category] ?? issue.category}
                    {issue.blocksRoom && (
                      <span className="rounded bg-rose-200/70 px-1 text-[10px] dark:bg-rose-900/60">
                        out of inventory
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 leading-snug">{issue.note}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
                    <span className="text-rose-700/80 dark:text-rose-300/80">
                      {issue.reportedBy} ·{" "}
                      {new Date(issue.reportedAt).toLocaleDateString()}
                    </span>
                    {canFixIssues && (
                      <button
                        type="button"
                        className="font-medium underline underline-offset-2 hover:text-rose-950 dark:hover:text-rose-100"
                        onClick={() => void markRoomFixed(issue._id, room.name)}
                      >
                        Mark fixed
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <RoomFaultHistory issues={faultHistoryByRoom.get(room._id) ?? []} />

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
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {!full && !room.faulty && !room.hold && (
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
                {room.hold ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-sky-700 hover:text-sky-800 dark:text-sky-400"
                    onClick={() => void releaseHold(room)}
                  >
                    <Unlock className="size-3" /> Release
                  </Button>
                ) : (
                  room.occupants === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        setHoldTarget(room);
                        setHoldNote("");
                      }}
                    >
                      <Lock className="size-3" /> Reserve
                    </Button>
                  )
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
                  className="h-7 gap-1 text-xs text-rose-700 hover:text-rose-800 dark:text-rose-400"
                  title="Flag a problem with this room — broken toilet, no water, faulty lock"
                  onClick={() => {
                    setFlagTarget(room);
                    setFlagCategory("toilet");
                    setFlagNote("");
                  }}
                >
                  <Flag className="size-3" /> Flag issue
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
                </div>
              </div>
            </section>
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

      {/* Flag a room problem — toilet broken, water not flowing, faulty lock */}
      <Dialog
        open={flagTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFlagTarget(null);
            setFlagNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag {flagTarget?.name}</DialogTitle>
            <DialogDescription>
              Record what is wrong so the next delegate is not put in a room
              with a known problem. The flag stays on the room card until the
              accommodation team marks it fixed, and a delegate can still be
              assigned here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>What is wrong</Label>
              <Select
                value={flagCategory}
                onValueChange={(value) =>
                  setFlagCategory(
                    (value ?? "other") as (typeof ISSUE_CATEGORIES)[number],
                  )
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {ISSUE_LABEL[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Details (required)</Label>
              <Textarea
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                placeholder="e.g. Toilet will not flush; the tap in the bathroom has no water"
                rows={3}
                aria-label="Room problem details"
              />
              <p className="text-[11px] text-muted-foreground">
                Write it as you would tell a colleague — this is the whole note
                the room team sees.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm">
              <Checkbox
                checked={flagBlocksRoom}
                onCheckedChange={(checked) => setFlagBlocksRoom(checked === true)}
                className="mt-0.5"
                aria-label="Take this room out of inventory until it is fixed"
              />
              <span>
                <span className="block font-medium">
                  Take this room out of inventory
                </span>
                <span className="block text-xs text-muted-foreground">
                  Nobody can be assigned here while the fault is open. Marking
                  it fixed puts the room straight back into service.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setFlagTarget(null)}
                disabled={flagBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitFlag()}
                disabled={flagBusy || !flagNote.trim()}
              >
                {flagBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Flag className="size-4" />
                )}
                Flag room
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reserve a room — held back from assignment until released */}
      <Dialog
        open={holdTarget !== null}
        onOpenChange={(open) => {
          if (!open) setHoldTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reserve {holdTarget?.name}</DialogTitle>
            <DialogDescription>
              A reserved room is kept out of assignment — it will not appear in
              the room picker or be filled by auto-assign. Release it whenever
              you need the space back.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Why is it reserved? (required)</Label>
              <Textarea
                value={holdNote}
                onChange={(e) => setHoldNote(e.target.value)}
                placeholder="e.g. Held for the bishop's party arriving Thursday"
                rows={3}
                aria-label="Reason for reserving the room"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setHoldTarget(null)}
                disabled={holdBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitHold()}
                disabled={holdBusy || !holdNote.trim()}
              >
                {holdBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Lock className="size-4" />
                )}
                Reserve room
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Last-minute delegate — a volunteer who is not in the system */}
      <Dialog open={walkInOpen} onOpenChange={setWalkInOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a last-minute delegate</DialogTitle>
            <DialogDescription>
              For a volunteer or guest who is not on any booking. This creates a
              confirmed, zero-value booking so the desk and rooming flows treat
              them like any other delegate — no payment is recorded against
              them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hub</Label>
                <Select
                  value={walkIn.hubId}
                  onValueChange={(value) =>
                    setWalkIn({ ...walkIn, hubId: value ?? "" })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a hub…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(hubs ?? []).map((hub) => (
                      <SelectItem key={hub._id} value={hub._id}>
                        {hub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={walkIn.title}
                  onChange={(e) => setWalkIn({ ...walkIn, title: e.target.value })}
                  placeholder="Member"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input
                  value={walkIn.firstName}
                  onChange={(e) => setWalkIn({ ...walkIn, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input
                  value={walkIn.lastName}
                  onChange={(e) => setWalkIn({ ...walkIn, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select
                  value={walkIn.gender}
                  onValueChange={(value) =>
                    setWalkIn({ ...walkIn, gender: (value ?? "male") as "male" | "female" })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accommodation</Label>
                <Select
                  value={walkIn.accommodationType}
                  onValueChange={(value) =>
                    setWalkIn({
                      ...walkIn,
                      accommodationType: (value ?? "dormitory") as (typeof TYPES)[number],
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_LABEL(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={walkIn.note}
                onChange={(e) => setWalkIn({ ...walkIn, note: e.target.value })}
                placeholder="e.g. Volunteer on the media team"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setWalkInOpen(false)}
                disabled={walkInBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitWalkIn()}
                disabled={
                  walkInBusy ||
                  !walkIn.hubId ||
                  !walkIn.firstName.trim() ||
                  !walkIn.lastName.trim()
                }
              >
                {walkInBusy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Add delegate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk delete */}
      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          setBulkDeleteOpen(open);
          if (!open) setDeleteConfirm("");
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete rooms in bulk</DialogTitle>
            <DialogDescription>
              This removes rooms from the inventory and from what hub reps can
              see. Rooms that still hold delegates are never deleted — move
              those guests first. Assignment history is kept (§9).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>What to delete</Label>
              <Select
                value={deleteScope}
                onValueChange={(value) => {
                  setDeleteScope(value ?? "");
                  setDeleteConfirm("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a scope…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {list.length} room(s)</SelectItem>
                  {TYPES.filter((type) =>
                    list.some((room) => room.accommodationType === type),
                  ).map((type) => (
                    <SelectItem key={type} value={`type:${type}`}>
                      All {TYPE_LABEL(type)} (
                      {list.filter((room) => room.accommodationType === type).length})
                    </SelectItem>
                  ))}
                  {buildings.map((building) => (
                    <SelectItem key={building} value={`building:${building}`}>
                      Block — {building}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {deleteScope && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                <p className="font-medium">
                  {deletableRooms.length} room(s) will be deleted.
                </p>
                {occupiedInDeleteScope > 0 && (
                  <p className="mt-0.5">
                    {occupiedInDeleteScope} room(s) still hold delegates and will
                    be kept.
                  </p>
                )}
                {deletableRooms.length === 0 && (
                  <p className="mt-0.5">
                    Nothing can be deleted in this scope right now.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>
                Type <span className="font-mono font-semibold">DELETE</span> to
                confirm
              </Label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                aria-label="Type DELETE to confirm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void runBulkDelete()}
                disabled={
                  busy || deleteConfirm !== "DELETE" || deletableRooms.length === 0
                }
              >
                <Trash2 className="size-4" /> Delete {deletableRooms.length} room(s)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore deleted rooms */}
      <Dialog
        open={restoreOpen}
        onOpenChange={(open) => {
          setRestoreOpen(open);
          if (!open) setRestorePicks([]);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Restore deleted rooms</DialogTitle>
            <DialogDescription>
              Rooms come back exactly as they were — same name, block,
              capacity, gender lock and published state. If a room with the
              same name and type has been created since, the live room keeps
              its place and the old copy is skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {deletedList.length} deleted · newest first
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    setRestorePicks(
                      deletedList
                        .filter((room) => !room.nameTaken)
                        .map((room) => room._id),
                    )
                  }
                  disabled={deletedList.every((room) => room.nameTaken)}
                >
                  Select all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setRestorePicks([])}
                  disabled={restorePicks.length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {deletedList.map((room) => {
                const picked = restorePicks.includes(room._id);
                return (
                  <label
                    key={room._id}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-2 text-xs transition-colors",
                      room.nameTaken
                        ? "opacity-60"
                        : "cursor-pointer hover:bg-muted/50",
                      picked && "border-primary/50 bg-primary/5",
                    )}
                  >
                    <Checkbox
                      checked={picked}
                      disabled={room.nameTaken}
                      onCheckedChange={(checked) =>
                        setRestorePicks((picks) =>
                          checked === true
                            ? [...picks, room._id]
                            : picks.filter((id) => id !== room._id),
                        )
                      }
                      aria-label={`Restore ${room.name}`}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{room.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABEL(room.accommodationType)}
                        </Badge>
                        {room.publishedAt != null && (
                          <Badge variant="secondary" className="text-[10px]">
                            Published
                          </Badge>
                        )}
                        {room.nameTaken && (
                          <Badge variant="destructive" className="text-[10px]">
                            Name in use — skipped
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {[room.building, `${room.capacity} bed(s)`]
                          .filter(Boolean)
                          .join(" · ")}{" "}
                        · deleted {new Date(room.deletedAt).toLocaleString()}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {deletedList.some((room) => room.nameTaken) && (
              <p className="text-xs text-muted-foreground">
                Rooms marked “Name in use” cannot come back as a second copy —
                edit the live room instead.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRestoreOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void runRestore()}
                disabled={busy || restorablePicks === 0}
              >
                <Undo2 className="size-4" /> Restore {restorablePicks || ""}{" "}
                room(s)
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
              needed. Re-importing updates the rooms that already exist —
              matching ignores case and spacing — and removes leftovers from
              earlier duplicate imports. Imports never exceed the confirmed
              inventory pools.
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
                {(previewRows.some(
                  (row: ImportPreview) => row.duplicateRows > 0 || row.duplicateRooms > 0,
                )) && (
                  <p className="mt-2 text-[11px] text-amber-700">
                    {previewRows.reduce((sum, row) => sum + row.duplicateRows, 0) > 0 &&
                      `${previewRows.reduce((sum, row) => sum + row.duplicateRows, 0)} repeated row(s) in the sheet will be ignored (the first row wins). `}
                    {previewRows.reduce((sum, row) => sum + row.duplicateRooms, 0) > 0 &&
                      `${previewRows.reduce((sum, row) => sum + row.duplicateRooms, 0)} existing duplicate room(s) will be removed on import (any with delegates still roomed in them are kept).`}
                  </p>
                )}
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
