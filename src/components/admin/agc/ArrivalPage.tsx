"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  BedDouble,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Flag,
  KeyRound,
  Loader2Icon,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  ChevronRight,
  ShieldAlert,
  Undo2,
  UserCheck,
  Users,
  ListChecks,
  Lock,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  GuestCorrectionDialog,
  type CorrectableGuest,
} from "@/components/admin/agc/GuestCorrectionDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Textarea } from "@/components/ui/textarea";
import {
  enqueueCheckIn,
  loadQueuedCheckIns,
  queuedCheckInEntry,
  removeQueuedCheckIns,
  type QueuedDeskCheckIn,
} from "@/lib/deskOfflineQueue";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { canAccessArea } from "@/lib/adminRoles";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import {
  TONE_BAR,
  TONE_RAIL,
  TONE_SURFACE,
  TONE_TEXT,
  checkInState,
  deskRowState,
  occupancyTone,
  paymentState,
  type StatusTone,
} from "@/lib/agcStatusTone";
import {
  StatTile,
  StatusBadge,
  StatusLegend,
} from "@/components/admin/agc/StatusPrimitives";
import { cn } from "@/lib/utils";

/**
 * Accommodation Check-In Module (Phase 2 §10–20) — the arrival desk.
 * Role-aware: checkin staff get search/keys/check-in/out; room_assignment
 * staff add room changes; admin/accommodation add overrides, corrections and
 * offline conflict resolution. The desk keeps working offline through the
 * local queue (§19) synced on reconnect.
 */

type AdminRoomRow = {
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
  hold?: { note: string; by: string; at: number } | null;
  /** Out of inventory while a blocking fault is open. */
  faulty?: boolean;
  occupants: number;
  assignments: { _id: string; guestId: string; bookingId: string }[];
};

type SearchRow = {
  guestId: string;
  bookingId: string;
  name: string;
  /** The parts of the name, so a correction form opens pre-filled. */
  title: string;
  firstName: string;
  lastName: string;
  gender: string;
  hubName: string;
  accommodationType: string;
  bookingRef: string;
  paymentStatus: string;
  bookingStatus: string;
  poaStatus: string | null;
  assignmentStatus: "assigned" | "unassigned";
  roomId: string | null;
  roomName: string | null;
  building: string | null;
  checkInStatus: "checked_in" | "checked_out" | "not_arrived";
  checkInId: string | null;
  checkedInAt: number | null;
  checkedInBy: string | null;
  checkedOutAt: number | null;
  pendingKeyRoom: boolean;
  bedNumber: number | null;
  keyStatus: "issued" | "returned" | "pending" | null;
  needsKey: boolean;
  /** Open "review this record" flag raised by the desk, or null. */
  reviewFlag: ReviewFlag | null;
};

type ReviewFlag = {
  _id: string;
  note: string;
  raisedAt: number;
  raisedBy: string;
  /** §18 override the reviewer pre-authorized from the queue, if any. */
  overrideAuthorizedBy: string | null;
  overrideReason: string | null;
};

const KEY_LABEL: Record<"issued" | "returned" | "pending", string> = {
  issued: "Issued",
  returned: "Returned",
  pending: "Pending",
};

const ROOM_ISSUE_LABEL: Record<string, string> = {
  toilet: "Toilet",
  water: "Water",
  electrical: "Electrical",
  door_lock: "Door / lock",
  cleaning: "Cleaning",
  other: "Other",
};

const ROOM_ISSUE_KEYS = [
  "toilet",
  "water",
  "electrical",
  "door_lock",
  "cleaning",
  "other",
] as const;

type RoomIssueCategory = (typeof ROOM_ISSUE_KEYS)[number];

/** Which desk stat tile is narrowing the sheet — the tiles double as filters. */
type DeskStatFilter =
  | "all"
  | "checked_in"
  | "checked_out"
  | "not_arrived"
  | "unassigned"
  | "keys_issued"
  | "keys_returned"
  | "faulty";

const STAT_FILTER_LABEL: Record<Exclude<DeskStatFilter, "all">, string> = {
  checked_in: "Checked in",
  checked_out: "Checked out",
  not_arrived: "Not arrived",
  unassigned: "Unassigned",
  keys_issued: "Keys issued",
  keys_returned: "Keys returned",
  faulty: "Faulty rooms",
};

type KeyRow = {
  _id: string;
  roomId: string;
  typeLabel: string;
  roomName: string;
  recipientName: string | null;
  status: string;
  issuedAt: number | null;
  issuedBy: string | null;
  replacedAt: number | null;
  replacedBy: string | null;
  returnedAt: number | null;
  returnedBy: string | null;
};

type ConflictRow = {
  _id: string;
  txId: string;
  staffId: string;
  building: string;
  action: string;
  originalAt: number;
  syncStatus: string;
  conflictReason: string | null;
  payloadPreview: string;
};

const TYPE_KEYS = ["dormitory", "hostel", "wise_serpents", "good_general", "ebpv"] as const;
const TYPE_LABEL = (type: string) =>
  AGC_ACCOMMODATION_LABELS[type as keyof typeof AGC_ACCOMMODATION_LABELS] ?? type;

const LOCATION_STORAGE_KEY = "homecoming-desk-location-v1";

/**
 * One row of the desk sheet. Memoised on purpose: the sheet holds up to 400
 * delegates and clicking one used to re-render every row, which is why
 * selecting a name felt slow. Only the rows whose highlight actually changed
 * re-render now.
 */
const DeskRosterRow = memo(function DeskRosterRow({
  row,
  selected,
  ticked,
  tickable,
  faulty,
  queued,
  onSelect,
  onTick,
}: {
  row: SearchRow;
  selected: boolean;
  ticked: boolean;
  /** Ready to check in (bed + payment) — only these can be bulk-ticked. */
  tickable: boolean;
  /** The delegate's room is out of inventory for a maintenance fault. */
  faulty: boolean;
  /** Checked in on this device while offline, not yet synced. */
  queued: QueuedDeskCheckIn | undefined;
  onSelect: (guestId: string) => void;
  onTick: (guestId: string) => void;
}) {
  const cell = checkInCell(row);
  return (
    <TableRow
      onClick={() => onSelect(row.guestId)}
      aria-selected={selected}
      className={cn(
        "cursor-pointer",
        ticked && "bg-emerald-50/70 dark:bg-emerald-950/20",
        selected ? "bg-sky-50 dark:bg-sky-950/40" : "hover:bg-muted/50",
      )}
    >
      <TableCell onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={ticked}
          disabled={!tickable}
          onCheckedChange={() => onTick(row.guestId)}
          aria-label={
            tickable
              ? `Tick ${row.name} for bulk check-in`
              : `${row.name} is not ready to check in`
          }
        />
      </TableCell>
      <TableCell className="font-medium tabular-nums">
        <div className="flex flex-wrap items-center gap-x-1">
          <span className="truncate">{row.roomName ?? "—"}</span>
          {faulty && (
            <span
              title="This room has an open fault and is out of inventory — check the room before placing anyone here"
              className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
            >
              <Wrench className="size-2.5" /> Faulty
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {row.bedNumber ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(row.guestId);
            }}
            className={cn(
              "min-w-0 truncate text-left font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid",
              selected && "text-sky-800 dark:text-sky-300",
            )}
          >
            {row.name}
          </button>
          {row.assignmentStatus !== "assigned" && (
            <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Unassigned
            </span>
          )}
          {row.reviewFlag && (
            <span
              title={`Flagged for review by ${row.reviewFlag.raisedBy}: ${row.reviewFlag.note}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            >
              <Flag className="size-2.5" /> Review
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden capitalize sm:table-cell">{row.gender}</TableCell>
      <TableCell className="hidden md:table-cell">{row.hubName}</TableCell>
      <TableCell className={cn("text-sm font-medium", cell.className)}>
        {queued ? (
          <span title={`${queued.guestName} was checked in on this device at ${new Date(queued.originalAt).toLocaleTimeString()} — it sends when the station syncs, so do not check them in again`}>
            Queued offline
            {" "}
            <span className="text-xs font-normal text-muted-foreground">
              {new Date(queued.originalAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
        ) : (
          cell.label
        )}
        {queued && (
          <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
            <WifiOff className="size-2.5" /> Local
          </span>
        )}
      </TableCell>
      <TableCell className="hidden text-sm sm:table-cell">
        {row.keyStatus ? KEY_LABEL[row.keyStatus] : "—"}
      </TableCell>
    </TableRow>
  );
});

/**
 * The same desk row as a phone-sized card. An eight-column table is unreadable
 * at that width, so room, bed and name stay on one line and the rest of the
 * row's state rides underneath it as badges — tapping the card opens the full
 * record in the bottom sheet. Memoised for the same reason as the table row:
 * the sheet holds hundreds of delegates and ticking one used to re-render all.
 */
const DeskRosterCard = memo(function DeskRosterCard({
  row,
  selected,
  ticked,
  tickable,
  faulty,
  queued,
  onSelect,
  onTick,
}: {
  row: SearchRow;
  selected: boolean;
  ticked: boolean;
  tickable: boolean;
  faulty: boolean;
  queued: QueuedDeskCheckIn | undefined;
  onSelect: (guestId: string) => void;
  onTick: (guestId: string) => void;
}) {
  const cell = checkInCell(row);
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-3 py-3 transition-colors",
        ticked && "bg-emerald-50/70 dark:bg-emerald-950/20",
        selected && "bg-sky-50 dark:bg-sky-950/40",
      )}
    >
      {/* Padded so a thumb can hit the tick without opening the record. */}
      <span className="-m-1 p-1">
        <Checkbox
          checked={ticked}
          disabled={!tickable}
          onCheckedChange={() => onTick(row.guestId)}
          aria-label={
            tickable
              ? `Tick ${row.name} for bulk check-in`
              : `${row.name} is not ready to check in`
          }
        />
      </span>
      <button
        type="button"
        onClick={() => onSelect(row.guestId)}
        className="min-w-0 flex-1 text-left"
        aria-current={selected ? "true" : undefined}
      >
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm font-semibold",
              selected && "text-sky-800 dark:text-sky-300",
            )}
          >
            {row.name}
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {row.roomName ? `Room ${row.roomName}` : "No room"}
          {row.bedNumber ? ` · Bed ${row.bedNumber}` : ""}
          {" · "}
          {row.hubName}
          {" · "}
          <span className="capitalize">{row.gender}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className={cn("text-[11px] font-medium", cell.className)}>
            {queued ? "Queued offline" : cell.label}
          </span>
          {queued && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
              <WifiOff className="size-2.5" /> Local
            </span>
          )}
          {row.keyStatus && (
            <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {/* The table has a "Key" header; on a card the label has to say
                  so, or "Pending" reads like a payment state. */}
              <KeyRound className="size-2.5" /> Key: {KEY_LABEL[row.keyStatus]}
            </span>
          )}
          {row.assignmentStatus !== "assigned" && (
            <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Unassigned
            </span>
          )}
          {row.reviewFlag && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              <Flag className="size-2.5" /> Review
            </span>
          )}
          {faulty && (
            <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
              <Wrench className="size-2.5" /> Room faulty
            </span>
          )}
        </span>
      </button>
    </li>
  );
});

export function ArrivalPage() {
  const { sessionToken, user } = useAdminSession();
  const role = user?.role ?? "";
  // Room-assignment staff run the desk with the accommodation team, so they
  // get the same decisions: overrides, corrections, clearing flags, conflicts.
  const isApprover =
    role === "admin" || role === "accommodation" || role === "room_assignment";

  const [location, setLocation] = useState<string>(() =>
    typeof window === "undefined" ? "central" : window.localStorage.getItem(LOCATION_STORAGE_KEY) ?? "central",
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, location);
    } catch {
      // Private mode — location resets next reload.
    }
  }, [location]);

  /** The building an admin posted this account to (Team page), if any. */
  const assignedBuilding = user?.defaultLocation ?? null;
  /**
   * Venue staff work one building: the desk opens there and stays there, so a
   * check-in station cannot drift onto another building's delegates by accident.
   * Approvers keep the picker, because they cover the whole site.
   */
  const locationLocked = role === "checkin" && !!assignedBuilding;
  /** The building this desk actually works: a posted check-in account cannot
   * switch away from it, so the whole page reads one building. */
  const deskLocation =
    role === "checkin" && assignedBuilding ? assignedBuilding : location;

  // --- Offline station + this device's queued arrivals (§19) ---
  const stations = useQuery(api.agcOffline.listStations, {});
  const queueOfflineTransactions = useMutation(api.agcOffline.queueTransactions);
  const syncOfflineTransactions = useMutation(
    api.agcOffline.syncPendingTransactions,
  );
  const [queuedCheckIns, setQueuedCheckIns] = useState<QueuedDeskCheckIn[]>(() =>
    typeof window === "undefined" ? [] : loadQueuedCheckIns(),
  );
  const [flushBusy, setFlushBusy] = useState(false);
  const registerOfflineStation = useMutation(api.agcOffline.registerStation);
  const [stationBusy, setStationBusy] = useState(false);
  const station = useMemo(
    () =>
      (stations ?? []).find(
        (entry) => entry.active && entry.building === deskLocation,
      ) ?? null,
    [stations, deskLocation],
  );
  const queuedByGuest = useMemo(
    () => new Map(queuedCheckIns.map((entry) => [entry.guestId, entry])),
    [queuedCheckIns],
  );
  const queuedGuestIds = useMemo(
    () => new Set(queuedByGuest.keys()),
    [queuedByGuest],
  );
  const isOnline = () => typeof navigator === "undefined" || navigator.onLine;

  const overview = useQuery(
    api.agcCheckin.getArrivalOverview,
    sessionToken ? { sessionToken } : "skip",
  );
  const recent = useQuery(
    api.agcCheckin.listRecentCheckIns,
    sessionToken ? { sessionToken, limit: 8 } : "skip",
  );
  const keys = useQuery(api.agcCheckin.listKeys, sessionToken ? { sessionToken } : "skip");

  // Search + roster filters
  const [search, setSearch] = useState("");
  const [statFilter, setStatFilter] = useState<DeskStatFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<"any" | "male" | "female">("any");
  const [hubFilter, setHubFilter] = useState<string>("all");
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Desk speed: the search box is focused on load, and "/" brings it back from
  // anywhere on the page without reaching for the mouse.
  useEffect(() => {
    searchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const searchResults = useQuery(
    api.agcCheckin.searchDelegates,
    sessionToken && search.trim().length >= 2
      ? {
          sessionToken,
          search,
          accommodationType:
            typeFilter === "all"
              ? undefined
              : (typeFilter as (typeof TYPE_KEYS)[number]),
          limit: 60,
        }
      : "skip",
  );

  // Grounded desk rows (dept defaults to location's building when set)
  const deskRows = useQuery(
    api.agcCheckin.listArrivalDesk,
    sessionToken
      ? {
          sessionToken,
          location: deskLocation === "central" ? undefined : deskLocation,
          // Departed delegates are off the sheet unless the Checked out tile
          // is doing the asking.
          includeCheckedOut: statFilter === "checked_out" ? true : undefined,
        }
      : "skip",
  );

  const checkInGuest = useMutation(api.agcCheckin.checkInGuest);
  const checkInGroup = useMutation(api.agcCheckin.checkInGroup);
  const checkInBatch = useMutation(api.agcCheckin.checkInBatch);
  const checkOutGuest = useMutation(api.agcCheckin.checkOutGuest);
  const correctCheckIn = useMutation(api.agcCheckin.correctCheckIn);
  const flagCheckInRecord = useMutation(api.agcCheckin.flagCheckInRecord);
  const resolveCheckinFlag = useMutation(api.agcCheckin.resolveCheckinFlag);
  const changeRoom = useMutation(api.agcRoomAssignments.changeRoom);
  const returnRoomKey = useMutation(api.agcCheckin.returnKey);
  const issueRoomKey = useMutation(api.agcCheckin.issueKey);
  const undoArrival = useMutation(api.agcCheckin.undoCheckIn);
  const [keyBusy, setKeyBusy] = useState(false);
  const publishedRooms = useQuery(
    api.agcRoomAssignments.listRoomsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  // Open maintenance faults, so the desk sees a broken room before checking
  // someone into it. A blocking fault means the room is out of inventory.
  const roomIssues = useQuery(
    api.agcRoomIssues.listRoomIssues,
    sessionToken ? { sessionToken } : "skip",
  );
  const issuesByRoom = useMemo(() => {
    const map = new Map<string, NonNullable<typeof roomIssues>["issues"]>();
    for (const issue of roomIssues?.issues ?? []) {
      const list = map.get(issue.roomId) ?? [];
      list.push(issue);
      map.set(issue.roomId, list);
    }
    return map;
  }, [roomIssues]);
  const rooms = useMemo(
    () =>
      (publishedRooms ?? []).map((room: AdminRoomRow) => ({
        _id: room._id,
        accommodationType: room.accommodationType,
        name: room.name,
        available: room.capacity - room.occupants,
        faulty: room.faulty === true,
        hold: room.hold ?? null,
        deleted: false,
      })),
    [publishedRooms],
  );
  const [busyGuest, setBusyGuest] = useState<string | null>(null);
  const [checkinTarget, setCheckinTarget] = useState<SearchRow | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [keyRecipientName, setKeyRecipientName] = useState("");
  const [checkoutTarget, setCheckoutTarget] = useState<SearchRow | null>(null);
  const [keyReturnStatus, setKeyReturnStatus] = useState<string>("not_applicable");
  const [issueKeyTarget, setIssueKeyTarget] = useState<SearchRow | null>(null);
  const [issueKeyRecipient, setIssueKeyRecipient] = useState("");
  const [undoTarget, setUndoTarget] = useState<SearchRow | null>(null);
  const [undoReason, setUndoReason] = useState("");
  const [undoBusy, setUndoBusy] = useState(false);
  const [correctTarget, setCorrectTarget] = useState<SearchRow | null>(null);
  const [correctReason, setCorrectReason] = useState("");
  const [flagTarget, setFlagTarget] = useState<SearchRow | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [resolveTarget, setResolveTarget] = useState<SearchRow | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [guestCorrectTarget, setGuestCorrectTarget] =
    useState<CorrectableGuest | null>(null);
  const [flagBusy, setFlagBusy] = useState(false);
  const [roomChangeTarget, setRoomChangeTarget] = useState<SearchRow | null>(null);
  const [changeRoomId, setChangeRoomId] = useState<string>("");
  const [changeReason, setChangeReason] = useState("");

  // --- Group check-in (§13) ---
  const [groupHub, setGroupHub] = useState<string>("");
  const [groupTicked, setGroupTicked] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);

  // --- Desk bulk check-in: tick ready delegates anywhere on the sheet ---
  const [batchTicked, setBatchTicked] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);

  /**
   * Park arrivals on this device when the station is offline. The building is
   * the key: only a building's designated station may queue, so the central
   * desk is told to pick its building instead of quietly losing the arrival.
   */
  const queueCheckInsOffline = (rows: SearchRow[]) => {
    if (!user?.email || rows.length === 0) return 0;
    if (deskLocation === "central") {
      toast.error("Pick your building before checking anyone in offline", {
        description:
          "The offline queue belongs to one building's designated station — the central desk is always online.",
      });
      return 0;
    }
    let next = loadQueuedCheckIns();
    for (const row of rows) {
      next = enqueueCheckIn(
        queuedCheckInEntry({
          guestId: row.guestId,
          guestName: row.name,
          building: deskLocation,
          location: deskLocation,
          roomName: row.roomName ?? undefined,
          keyRecipientName:
            row.needsKey && row.keyStatus === "pending" ? row.name : undefined,
          staffId: user.email,
          staffRole: user.role,
        }),
      );
    }
    setQueuedCheckIns(next);
    toast.info(
      `${rows.length} check-in${rows.length === 1 ? "" : "s"} queued on this device`,
      {
        description:
          "They are sent to the server when the station reconnects — do not check these delegates in again.",
      },
    );
    return rows.length;
  };

  /**
   * Push this device's queue through the designated station, then replay it.
   * The server dedupes on txId, so a repeated push never checks anyone in
   * twice; anything it cannot apply comes back as a conflict for review.
   */
  const flushOfflineCheckIns = useCallback(async () => {
    if (flushBusy || !sessionToken || !user?.email) return;
    const rows = loadQueuedCheckIns();
    if (rows.length === 0) {
      setQueuedCheckIns([]);
      return;
    }
    if (!station) {
      toast.error(`No designated offline station for ${deskLocation}`, {
        description:
          "Designate this device from the desk before queued arrivals can be sent — a posted check-in account can claim it on first sign-in.",
      });
      return;
    }
    setFlushBusy(true);
    try {
      const batch = rows.slice(0, 25);
      await queueOfflineTransactions({
        sessionToken,
        building: station.building,
        stationName: station.stationName,
        transactions: batch.map((entry) => ({
          txId: entry.txId,
          staffId: entry.staffId ?? user.email,
          staffRole: entry.staffRole ?? user.role,
          action: "check_in" as const,
          payload: JSON.stringify({
            guestId: entry.guestId,
            location: entry.location,
            keyRecipientName: entry.keyRecipientName,
          }),
          originalAt: entry.originalAt,
        })),
      });
      const result = await syncOfflineTransactions({
        sessionToken,
        building: station.building,
      });
      setQueuedCheckIns(removeQueuedCheckIns(batch.map((entry) => entry.txId)));
      if (result.conflicts > 0) {
        toast.warning(
          `${result.applied} queued check-in(s) applied · ${result.conflicts} need review.`,
          { description: "Open Offline sync exceptions to resolve them." },
        );
      } else {
        toast.success(
          `${result.applied} queued check-in${result.applied === 1 ? "" : "s"} applied.`,
        );
      }
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Could not send the queued check-ins"),
      );
    } finally {
      setFlushBusy(false);
    }
  }, [
    flushBusy,
    sessionToken,
    user,
    station,
    deskLocation,
    queueOfflineTransactions,
    syncOfflineTransactions,
  ]);

  /**
   * Claim this device as the building's offline station. A posted check-in
   * desk may do this once, on the device it will work from — otherwise a dead
   * zone means waiting for an admin before the first offline check-in.
   */
  const designateDeskStation = async () => {
    if (!sessionToken) return;
    setStationBusy(true);
    try {
      await registerOfflineStation({
        sessionToken,
        building: deskLocation,
        stationName: `Station ${deskLocation}`,
      });
      toast.success(`${deskLocation} is now this device's offline station.`, {
        description:
          "Check-ins taken here while disconnected are queued on this device and sent when it reconnects.",
      });
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Could not designate this device"),
      );
    } finally {
      setStationBusy(false);
    }
  };

  // Reconnecting is the whole point of the queue: send it without being asked.
  useEffect(() => {
    const onOnline = () => {
      if (queuedCheckIns.length > 0) void flushOfflineCheckIns();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [queuedCheckIns.length, flushOfflineCheckIns]);

  const doCheckIn = async () => {
    if (!sessionToken || !checkinTarget) return;
    const row = checkinTarget;
    // No connection: the arrival is taken on the device and replayed later.
    if (!isOnline()) {
      if (queueCheckInsOffline([row])) setCheckinTarget(null);
      return;
    }
    setBusyGuest(checkinTarget.guestId);
    try {
      const result = await checkInGuest({
        sessionToken,
        guestId: checkinTarget.guestId as Id<"agcGuests">,
        location: deskLocation,
        override: overrideReason.trim()
          ? { reason: overrideReason.trim() }
          : undefined,
        keyRecipientName: keyRecipientName.trim() || undefined,
      });
      if (result.keysAlreadyIssuedTo) {
        toast.info(
          `Keys were already issued to ${result.keysAlreadyIssuedTo} — direct them to coordinate access.`,
        );
      } else if (result.keyIssued) {
        toast.success("Checked in — keys recorded.");
      } else {
        toast.success("Checked in.");
      }
      setCheckinTarget(null);
      setOverrideReason("");
      setKeyRecipientName("");
    } catch (err) {
      // A connection can drop between the tap and the write — queue it rather
      // than send the delegate away as a failed check-in.
      if (!isOnline()) {
        if (queueCheckInsOffline([row])) setCheckinTarget(null);
      } else {
        toast.error(...toastFriendlyErrorParts(err, "Check-in failed"));
      }
    } finally {
      setBusyGuest(null);
    }
  };

  const doCheckOut = async () => {
    if (!sessionToken || !checkoutTarget) return;
    setBusyGuest(checkoutTarget.guestId);
    try {
      await checkOutGuest({
        sessionToken,
        guestId: checkoutTarget.guestId as Id<"agcGuests">,
        keyReturnStatus: keyReturnStatus as "returned" | "not_returned" | "not_applicable",
      });
      toast.success("Checked out.");
      setCheckoutTarget(null);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Check-out failed"));
    } finally {
      setBusyGuest(null);
    }
  };

  const doCorrect = async () => {
    if (!sessionToken || !correctTarget?.checkInId) return;
    setBusyGuest(correctTarget.guestId);
    try {
      await correctCheckIn({
        sessionToken,
        checkInId: correctTarget.checkInId as Id<"agcCheckIns">,
        reason: correctReason.trim(),
      });
      toast.success("Check-in corrected.");
      setCorrectTarget(null);
      setCorrectReason("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Correction failed"));
    } finally {
      setBusyGuest(null);
    }
  };

  const doFlagRecord = async () => {
    if (!sessionToken || !flagTarget) return;
    setFlagBusy(true);
    try {
      await flagCheckInRecord({
        sessionToken,
        guestId: flagTarget.guestId as Id<"agcGuests">,
        note: flagNote.trim(),
      });
      toast.success("Flagged for review — the Accommodation Admin sees the note.");
      setFlagTarget(null);
      setFlagNote("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not flag this record"));
    } finally {
      setFlagBusy(false);
    }
  };

  const doResolveFlag = async () => {
    if (!sessionToken || !resolveTarget?.reviewFlag) return;
    setFlagBusy(true);
    try {
      await resolveCheckinFlag({
        sessionToken,
        flagId: resolveTarget.reviewFlag._id as Id<"agcCheckinFlags">,
        resolutionNote: resolveNote.trim(),
      });
      toast.success("Review flag cleared — the record stays in the log.");
      setResolveTarget(null);
      setResolveNote("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not clear the flag"));
    } finally {
      setFlagBusy(false);
    }
  };

  const doRoomChange = async () => {
    if (!sessionToken || !roomChangeTarget || !changeRoomId || !changeReason.trim()) return;
    setBusyGuest(roomChangeTarget.guestId);
    try {
      await changeRoom({
        sessionToken,
        guestId: roomChangeTarget.guestId as Id<"agcGuests">,
        toRoomId: changeRoomId as Id<"agcRooms">,
        reason: changeReason.trim(),
      });
      toast.success("Room changed — history recorded.");
      setRoomChangeTarget(null);
      setChangeRoomId("");
      setChangeReason("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Room change failed"));
    } finally {
      setBusyGuest(null);
    }
  };

  const doReturnKey = async (roomId: Id<"agcRooms">) => {
    if (!sessionToken) return;
    setKeyBusy(true);
    try {
      await returnRoomKey({ sessionToken, roomId });
      toast.success("Key marked returned.");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not return key"));
    } finally {
      setKeyBusy(false);
    }
  };

  /** Record a key hand-over for a delegate who is already checked in. */
  const doIssueKey = async () => {
    if (!sessionToken || !issueKeyTarget) return;
    setKeyBusy(true);
    try {
      const result = await issueRoomKey({
        sessionToken,
        guestId: issueKeyTarget.guestId as Id<"agcGuests">,
        recipientName: issueKeyRecipient.trim() || undefined,
      });
      toast.success(`Key issued to ${result.recipientName}.`);
      setIssueKeyTarget(null);
      setIssueKeyRecipient("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not issue the key"));
    } finally {
      setKeyBusy(false);
    }
  };

  /** Undo a check-in — the delegate goes back to Not Arrived. */
  const doUndoCheckIn = async () => {
    if (!sessionToken || !undoTarget?.checkInId) return;
    setUndoBusy(true);
    try {
      const result = await undoArrival({
        sessionToken,
        checkInId: undoTarget.checkInId as Id<"agcCheckIns">,
        reason: undoReason.trim(),
      });
      toast.success("Check-in undone — the delegate is back on the Not Arrived list.", {
        description: result.keyStillIssuedTo
          ? `A key is still recorded to ${result.keyStillIssuedTo} — mark it returned when it comes back.`
          : undefined,
      });
      setUndoTarget(null);
      setUndoReason("");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not undo the check-in"));
    } finally {
      setUndoBusy(false);
    }
  };

  /**
   * Search first, else the grounded desk sheet. The roster then applies the
   * gender / hub / room-type pills on top, so the desk can narrow the sheet
   * without re-querying.
   */
  const baseRows = useMemo<SearchRow[]>(() => {
    if (search.trim().length >= 2) return (searchResults ?? []) as SearchRow[];
    return (deskRows ?? []) as SearchRow[];
  }, [search, searchResults, deskRows]);

  const rosterRows = useMemo(() => {
    const filtered = baseRows.filter((row) => {
      // A stat tile narrows the sheet to exactly what its number counts.
      switch (statFilter) {
        case "checked_in":
          if (row.checkInStatus !== "checked_in") return false;
          break;
        case "checked_out":
          if (row.checkInStatus !== "checked_out") return false;
          break;
        case "not_arrived":
          if (row.checkInStatus !== "not_arrived") return false;
          break;
        case "unassigned":
          if (row.assignmentStatus !== "unassigned") return false;
          break;
        case "keys_issued":
          if (row.keyStatus !== "issued") return false;
          break;
        case "keys_returned":
          if (row.keyStatus !== "returned") return false;
          break;
        case "faulty": {
          const issues = row.roomId ? (issuesByRoom.get(row.roomId) ?? []) : [];
          if (!issues.some((issue) => issue.blocksRoom)) return false;
          break;
        }
        default:
          break;
      }
      if (genderFilter !== "any" && row.gender !== genderFilter) return false;
      if (hubFilter !== "all" && row.hubName !== hubFilter) return false;
      if (typeFilter !== "all" && row.accommodationType !== typeFilter) return false;
      return true;
    });
    // Room order reads like the building does: 101 bed 1, 101 bed 2, then
    // unassigned delegates at the bottom.
    return [...filtered].sort((a, b) => {
      const roomA = a.roomName ?? "\uffff";
      const roomB = b.roomName ?? "\uffff";
      if (roomA !== roomB) return roomA.localeCompare(roomB);
      const bedA = a.bedNumber ?? 0;
      const bedB = b.bedNumber ?? 0;
      if (bedA !== bedB) return bedA - bedB;
      return a.name.localeCompare(b.name);
    });
  }, [baseRows, genderFilter, hubFilter, typeFilter, statFilter, issuesByRoom]);

  const selectedRow = useMemo(
    () => rosterRows.find((row) => row.guestId === selectedGuestId) ?? null,
    [rosterRows, selectedGuestId],
  );

  /** Open maintenance faults on the selected delegate's room, if any. */
  const selectedRoomIssues = selectedRow?.roomId
    ? (issuesByRoom.get(selectedRow.roomId) ?? [])
    : [];

  /**
   * The rooms this desk may look at: everything at central, one building when
   * the desk is posted. Keeps a posted station from reading another block's
   * holds and faults.
   */
  const deskRooms = useMemo(
    () =>
      (publishedRooms ?? []).filter(
        (room) =>
          deskLocation === "central" || room.building === deskLocation,
      ),
    [publishedRooms, deskLocation],
  );
  const deskIssues = useMemo(
    () =>
      (roomIssues?.issues ?? []).filter(
        (issue) =>
          deskLocation === "central" || issue.building === deskLocation,
      ),
    [roomIssues, deskLocation],
  );
  const reservedDeskRooms = useMemo(
    () => deskRooms.filter((room) => room.hold),
    [deskRooms],
  );
  const reservedDeskBeds = useMemo(
    () => reservedDeskRooms.reduce((sum, room) => sum + room.capacity, 0),
    [reservedDeskRooms],
  );
  const faultyDeskRooms = useMemo(
    () => deskRooms.filter((room) => room.faulty).length,
    [deskRooms],
  );

  /**
   * Rooms matching the search term. The delegate search already matches a room
   * number, but an empty room has no delegate to match — this strip lets the
   * desk find it, and shows at a glance whether it is reserved or faulty.
   */
  const matchingRooms = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 2) return [];
    return deskRooms
      .filter((room) =>
        `${room.name} ${room.building ?? ""} ${TYPE_LABEL(room.accommodationType)}`
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 8);
  }, [search, deskRooms]);

  /** First visit to the desk: the query has not answered yet. */
  const deskLoading = search.trim().length < 2 && deskRows === undefined;

  /** Only rows the desk can actually check in right now: bed + payment. */
  const readyRows = useMemo(
    () =>
      rosterRows.filter(
        (row) => deskRowState(row).ready && !queuedGuestIds.has(row.guestId),
      ),
    [rosterRows, queuedGuestIds],
  );
  const allReadyTicked =
    readyRows.length > 0 && readyRows.every((row) => batchTicked.includes(row.guestId));
  /** Stable, so ticking one row does not re-render the whole sheet. */
  const tickRow = useCallback(
    (guestId: string) =>
      setBatchTicked((current) =>
        current.includes(guestId)
          ? current.filter((id) => id !== guestId)
          : [...current, guestId],
      ),
    [],
  );

  const doBatchCheckIn = async () => {
    if (!sessionToken) return;
    const ticks = batchTicked
      .map((guestId) => rosterRows.find((row) => row.guestId === guestId))
      .filter(
        (row): row is SearchRow =>
          Boolean(row) &&
          deskRowState(row!).ready &&
          !queuedGuestIds.has(row!.guestId),
      );
    if (ticks.length === 0) {
      toast.info("Tick the ready delegates you want to check in together.");
      return;
    }
    if (!isOnline()) {
      if (queueCheckInsOffline(ticks) > 0) setBatchTicked([]);
      return;
    }
    setBatchBusy(true);
    try {
      const result = await checkInBatch({
        sessionToken,
        location: deskLocation,
        guests: ticks.map((row) => ({ guestId: row.guestId as Id<"agcGuests"> })),
      });
      const rejected = result.results.filter((r) => r.status === "rejected");
      if (rejected.length > 0) {
        toast.warning(
          `Bulk check-in: ${result.checkedInCount} checked in, ${rejected.length} rejected.`,
          { description: rejected.map((r) => r.reason).join(" · ") },
        );
      } else {
        toast.success(
          `Checked in ${result.checkedInCount} delegate(s) in one go.`,
        );
      }
      setBatchTicked((current) =>
        current.filter(
          (id) => !result.results.some((r) => r.guestId === id && r.status === "checked_in"),
        ),
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Bulk check-in failed"));
    } finally {
      setBatchBusy(false);
    }
  };

  const filtersActive =
    genderFilter !== "any" ||
    hubFilter !== "all" ||
    typeFilter !== "all" ||
    statFilter !== "all";
  const clearFilters = () => {
    setGenderFilter("any");
    setHubFilter("all");
    setTypeFilter("all");
    setStatFilter("all");
    setSearch("");
    setSelectedGuestId(null);
  };

  /**
   * A single match that is ready to check in: Enter at the desk then works
   * without reaching for the mouse. Anything else still goes through its row.
   */
  const soleReadyRow = useMemo(() => {
    if (rosterRows.length !== 1) return null;
    const row = rosterRows[0];
    return deskRowState(row).ready && !queuedGuestIds.has(row.guestId) ? row : null;
  }, [rosterRows, queuedGuestIds]);

  // --- Group check-in (§13) ---
  const groupRows = useMemo(() => {
    if (!groupHub) return [];
    return rosterRows.filter((row) => row.hubName === groupHub);
  }, [rosterRows, groupHub]);
  const hubOptions = useMemo(
    () => [...new Set(baseRows.map((row) => row.hubName))].sort(),
    [baseRows],
  );
  const tickGroup = (guestId: string, wanted: boolean) =>
    setGroupTicked((prev) =>
      wanted ? [...new Set([...prev, guestId])] : prev.filter((id) => id !== guestId),
    );
  const tickableInGroup = groupRows.filter(
    (row) =>
      row.assignmentStatus === "assigned" &&
      row.checkInStatus === "not_arrived",
  );

  const doGroupCheckIn = async () => {
    if (!sessionToken) return;
    const ticks = groupTicked
      .map((guestId) => tickableInGroup.find((row) => row.guestId === guestId))
      .filter((row): row is SearchRow => Boolean(row));
    if (ticks.length === 0) {
      toast.info("Tick the delegates who physically arrived — others stay Not Arrived.");
      return;
    }
    if (!isOnline()) {
      if (queueCheckInsOffline(ticks) > 0) setGroupTicked([]);
      return;
    }
    setGroupBusy(true);
    try {
      const result = await checkInGroup({
        sessionToken,
        location: deskLocation,
        arrivals: ticks.map((row) => ({ guestId: row.guestId as Id<"agcGuests"> })),
      });
      const rejected = result.results.filter((r) => r.status === "rejected");
      if (rejected.length > 0) {
        toast.warning(
          `Group check-in: ${result.checkedInCount} checked in, ${rejected.length} rejected — unticked delegates remain Not Arrived.`,
          { description: rejected.map((r) => r.reason).join(" · ") },
        );
      } else {
        toast.success(
          `Group check-in: ${result.checkedInCount} delegate(s) checked in — the rest of ${groupHub} stays Not Arrived.`,
        );
      }
      setGroupTicked([]);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Group check-in failed"));
    } finally {
      setGroupBusy(false);
    }
  };

  /**
   * The payment gate the desk shows is the same one the server enforces, so a
   * delegate whose override the Accommodation Admin pre-authorized from the
   * review queue checks in without an approver typing a reason at the counter.
   */
  const paymentOutstanding = checkinTarget
    ? checkinTarget.paymentStatus !== "confirmed" &&
      checkinTarget.poaStatus !== "confirmed"
    : false;
  const preAuthorizedOverride = checkinTarget?.reviewFlag?.overrideAuthorizedBy
    ? checkinTarget.reviewFlag
    : null;

  return (
    <div className="space-y-4">
      <DeskAlerts
        data={overview}
        reviewQueueHref={
          isApprover && (overview?.reviewFlags ?? 0) > 0
            ? "/admin/accommodation?tab=flags"
            : null
        }
      />

      <DeskStatStrip
        data={overview}
        reservedRooms={reservedDeskRooms.length}
        reservedBeds={reservedDeskBeds}
        faultyRooms={faultyDeskRooms}
        activeFilter={statFilter}
        onSelect={(filter) =>
          setStatFilter((current) => (current === filter ? "all" : filter))
        }
      />

      {/* First sign-in on a dead-zone desk: claim the station before the
          connection drops, without waiting for an admin to walk over. */}
      {role === "checkin" &&
        assignedBuilding &&
        stations !== undefined &&
        !station && (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-2.5 text-xs">
              <WifiOff className="size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>
                <strong>{deskLocation}</strong> has no offline station yet. Claim
                this device before the connection drops, so check-ins taken here
                are queued on it instead of lost.
              </span>
              <Button
                size="sm"
                className="ml-auto h-7 gap-1.5 text-xs"
                disabled={stationBusy}
                onClick={() => void designateDeskStation()}
              >
                {stationBusy ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <WifiOff className="size-3.5" />
                )}
                Designate this device
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Search + filters — the roster reads left to right, the selected
          delegate's full record opens beside it. */}
      <div className="space-y-3">
        <div className="flex items-stretch gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              className="h-11 pl-9 text-base"
              placeholder="Search name, hub, room number or booking ref"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !soleReadyRow) return;
                event.preventDefault();
                setSelectedGuestId(soleReadyRow.guestId);
                setCheckinTarget(soleReadyRow);
                setOverrideReason("");
                setKeyRecipientName(soleReadyRow.name);
              }}
            />
          </div>
          <Button
            type="button"
            className="h-11 px-6"
            onClick={() => {
              // Search is live; the button still applies the trimmed term and
              // returns focus, which is how the desk operates with a mouse.
              setSearch((term) => term.trim());
              searchRef.current?.focus();
            }}
          >
            Search
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Gender:</span>
            {(["any", "male", "female"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={genderFilter === value}
                onClick={() => setGenderFilter(value)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-medium capitalize transition-colors",
                  genderFilter === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <Select value={hubFilter} onValueChange={(value) => setHubFilter(value ?? "all")}>
            <SelectTrigger
              className="h-8 w-auto min-w-32 gap-1 rounded-full px-3 text-xs"
              aria-label="Filter by hub"
            >
              {/* The trigger has to say what is filtered, not echo the raw
                  value — "all" beside "all" tells a phone user nothing. The hub
                  name is shown on its own: every option here is a hub already. */}
              <SelectValue>
                {hubFilter === "all" ? "All hubs" : hubFilter}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All hubs</SelectItem>
              {hubOptions.map((hub) => (
                <SelectItem key={hub} value={hub}>
                  {hub}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "all")}>
            <SelectTrigger
              className="h-8 w-auto min-w-36 gap-1 rounded-full px-3 text-xs"
              aria-label="Filter by room type"
            >
              <SelectValue>
                {typeFilter === "all"
                  ? "Room type: Any"
                  : `Room type: ${TYPE_LABEL(typeFilter)}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Room type: Any</SelectItem>
              {TYPE_KEYS.map((type) => (
                <SelectItem key={type} value={type}>
                  Room type: {TYPE_LABEL(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={deskLocation}
            onValueChange={(value) => setLocation(value ?? "central")}
            disabled={locationLocked}
          >
            <SelectTrigger
              className="h-8 w-auto min-w-36 gap-1 rounded-full px-3 text-xs"
              aria-label="Desk location"
              title={
                locationLocked
                  ? `Posted to ${deskLocation} — an admin changes this on the Team page`
                  : undefined
              }
            >
              <SelectValue>
                {deskLocation === "central"
                  ? "Location: Central desk"
                  : `Location: ${deskLocation}`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="central">Location: Central desk</SelectItem>
              {[
                ...new Set(
                  (deskRows ?? [])
                    .map((row) => row.building)
                    .filter((b): b is string => typeof b === "string"),
                ),
              ].map((building) => (
                <SelectItem key={building} value={building}>
                  Location: {building}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="link"
            className="h-8 px-1 text-xs font-medium"
            onClick={clearFilters}
            disabled={!filtersActive && !search}
          >
            Clear filters
          </Button>

          {canAccessArea(role, "accommodation") && (
            <Link
              href="/admin/accommodation?tab=rooms"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "ml-auto h-8 gap-1.5 text-xs",
              )}
            >
              <BedDouble className="size-3.5" /> Bulk assign
            </Link>
          )}
        </div>
      </div>

      {statFilter !== "all" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge tone="info">
            Showing: {STAT_FILTER_LABEL[statFilter]}
          </StatusBadge>
          <span className="text-muted-foreground">
            {rosterRows.length} delegate{rosterRows.length === 1 ? "" : "s"} on the
            sheet
            {statFilter === "keys_issued" || statFilter === "keys_returned"
              ? " — filtered by the room's key state"
              : statFilter === "faulty"
                ? " — filtered to rooms out of inventory"
                : ""}
          </span>
          <Button
            variant="link"
            className="h-6 px-1 text-xs"
            onClick={() => setStatFilter("all")}
          >
            Show all
          </Button>
        </div>
      )}

      {matchingRooms.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-1.5 p-2.5 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <BedDouble className="size-3.5" /> Rooms matching “{search.trim()}”
            </span>
            {matchingRooms.map((room) => (
              <span
                key={room._id}
                className={cn(
                  "rounded-full border px-2 py-0.5",
                  room.faulty
                    ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    : room.hold
                      ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                      : "bg-background",
                )}
              >
                {room.name}
                <span className="text-muted-foreground">
                  {" "}· {TYPE_LABEL(room.accommodationType)}
                  {room.building ? ` · ${room.building}` : ""} · {room.occupants}/
                  {room.capacity}
                  {room.faulty ? " · faulty" : room.hold ? " · reserved" : ""}
                </span>
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* The record column only exists once a delegate is chosen, so the sheet
          takes the full width of the page until then. */}
      <div
        className={cn(
          "grid gap-4",
          selectedRow ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1",
        )}
      >
        {/* The sheet is the longest thing on the page, so it scrolls in place
            with its header pinned rather than pushing the record card and the
            desk tools down the page (the rooms grid reads the same way). */}
        <Card className="overflow-hidden">
          {/* Bulk check-in sits above the sheet: tick the ready delegates in
              the rows below and check them in one action. */}
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ListChecks className="size-3.5" /> Bulk check-in
            </span>
            {batchTicked.length === 0 ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {deskLoading || readyRows.length === 0
                  ? "Tick ready delegates below to check them in together."
                  : `Tick ready delegates below — ${readyRows.length} ready in this view.`}
              </span>
            ) : (
              <span className="text-xs font-medium">{batchTicked.length} ticked</span>
            )}
            <span className="grow" />
            {readyRows.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={allReadyTicked}
                  onCheckedChange={(checked) =>
                    setBatchTicked(
                      checked ? readyRows.map((row) => row.guestId) : [],
                    )
                  }
                  aria-label="Tick every ready delegate in this view"
                />
                Select all ready
              </label>
            )}
            {batchTicked.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={batchBusy}
                  onClick={() => setBatchTicked([])}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={batchBusy}
                  onClick={() => void doBatchCheckIn()}
                >
                  {batchBusy ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <UserCheck className="size-3.5" />
                  )}
                  Check in {batchTicked.length}
                </Button>
              </>
            )}
          </div>
          {/* Phones scroll the page, not a box inside it — a capped scroller
              nested in the page is what makes a list feel stuck on a touch
              screen. From sm up the sheet keeps its own scroll area. */}
          <CardContent className="p-0 sm:max-h-[60vh] sm:overflow-auto">
            {/* Phones get a list: tapping a delegate opens the record as a
                bottom sheet rather than scrolling past a sideways table. The
                tick / fault / queue rules below deliberately mirror the table,
                so a delegate is checkable the same way in either layout. */}
            <ul className="divide-y sm:hidden">
              {deskLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <li
                    key={`desk-card-loading-${i}`}
                    aria-hidden
                    className="flex items-start gap-3 px-3 py-3"
                  >
                    <Skeleton className="size-4 rounded-[4px]" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </li>
                ))
              ) : rosterRows.length === 0 ? (
                <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {filtersActive || search
                    ? "No delegate matches these filters — clear them to see the full sheet."
                    : "No delegates on the desk yet — rooms and bookings feed this sheet."}
                </li>
              ) : (
                rosterRows.map((row) => (
                  <DeskRosterCard
                    key={row.guestId}
                    row={row}
                    selected={row.guestId === selectedGuestId}
                    ticked={batchTicked.includes(row.guestId)}
                    tickable={
                      deskRowState(row).ready && !queuedGuestIds.has(row.guestId)
                    }
                    queued={queuedByGuest.get(row.guestId)}
                    faulty={
                      row.roomId
                        ? (issuesByRoom.get(row.roomId) ?? []).some(
                            (issue) => issue.blocksRoom,
                          )
                        : false
                    }
                    onSelect={setSelectedGuestId}
                    onTick={tickRow}
                  />
                ))
              )}
            </ul>
            <div className="hidden sm:block">
            <Table>
              {/* The sheet scrolls inside its own 60vh box, so the header pins
                  to the top edge of that box (`top-0`). Offsetting it by the
                  console's 64px header pushed it down into the rows instead —
                  the box already starts below the fixed header. */}
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_theme(colors.border)]">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-8">
                    <span className="sr-only">Select for bulk check-in</span>
                  </TableHead>
                  <TableHead className="w-16">Room</TableHead>
                  <TableHead className="w-12">Bed</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Gender</TableHead>
                  <TableHead className="hidden md:table-cell">Hub</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead className="hidden sm:table-cell">Key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deskLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`desk-loading-${i}`} aria-hidden>
                      <TableCell><Skeleton className="size-4 rounded-[4px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-14" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-14" /></TableCell>
                    </TableRow>
                  ))
                ) : rosterRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      {filtersActive || search
                        ? "No delegate matches these filters — clear them to see the full sheet."
                        : "No delegates on the desk yet — rooms and bookings feed this sheet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rosterRows.map((row) => (
                    <DeskRosterRow
                      key={row.guestId}
                      row={row}
                      selected={row.guestId === selectedGuestId}
                      ticked={batchTicked.includes(row.guestId)}
                      tickable={
                        deskRowState(row).ready && !queuedGuestIds.has(row.guestId)
                      }
                      queued={queuedByGuest.get(row.guestId)}
                      faulty={
                        row.roomId
                          ? (issuesByRoom.get(row.roomId) ?? []).some(
                              (issue) => issue.blocksRoom,
                            )
                          : false
                      }
                      onSelect={setSelectedGuestId}
                      onTick={tickRow}
                    />
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        {/* Nothing selected: there is no record card at all. Once a delegate is
            chosen it appears beside the sheet (and, on a phone, as the bottom
            sheet itself). */}
        {selectedRow && (
          <>
            <div
              aria-hidden
              onClick={() => setSelectedGuestId(null)}
              className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            />
            <Card
              className={cn(
                "h-fit lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto",
                "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[85dvh] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:rounded-t-2xl max-lg:rounded-b-none max-lg:border-x-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-2xl",
              )}
            >
              {/* Closes the record everywhere: on a desktop that hands the
                  page back to the full-width sheet. */}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card px-4 py-1.5 lg:justify-end">
                <span className="text-xs font-medium text-muted-foreground lg:hidden">
                  Delegate record
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSelectedGuestId(null)}
                  aria-label="Close delegate record"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <CardContent className="p-4">
                <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-semibold leading-tight">{selectedRow.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="capitalize">{selectedRow.gender}</span>
                    {" · "}Hub {selectedRow.hubName}
                    {selectedRow.bookingRef ? ` · Ref ${selectedRow.bookingRef}` : ""}
                  </p>
                </div>

                <dl className="space-y-1.5 text-sm">
                  <DetailLine label="Paid room type" value={TYPE_LABEL(selectedRow.accommodationType)} />
                  <DetailLine
                    label="Location"
                    value={
                      selectedRow.assignmentStatus === "assigned"
                        ? [
                            selectedRow.building,
                            selectedRow.roomName,
                            selectedRow.bedNumber ? `Bed ${selectedRow.bedNumber}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "No room yet"
                    }
                  />
                  <DetailLine
                    label="Status"
                    value={
                      queuedGuestIds.has(selectedRow.guestId)
                        ? "Queued offline (this device)"
                        : deskRowState(selectedRow).label
                    }
                  />
                  <DetailLine
                    label="Payment"
                    value={paymentState(selectedRow.paymentStatus, selectedRow.poaStatus).label}
                  />
                  <DetailLine
                    label="Key"
                    value={
                      selectedRow.keyStatus
                        ? KEY_LABEL[selectedRow.keyStatus]
                        : "Not tracked (wristband)"
                    }
                  />
                </dl>

                {selectedRow.reviewFlag && (
                  <div
                    className={cn(
                      "space-y-1 rounded-lg border border-l-4 px-3 py-2 text-xs",
                      TONE_SURFACE.blocked,
                      TONE_RAIL.blocked,
                    )}
                  >
                    <p className={cn("flex items-center gap-1.5 font-medium", TONE_TEXT.blocked)}>
                      <Flag className="size-3.5 shrink-0" /> Flagged for review
                    </p>
                    <p className="text-foreground/80">{selectedRow.reviewFlag.note}</p>
                    <p className="text-muted-foreground">
                      Raised by {selectedRow.reviewFlag.raisedBy} ·{" "}
                      {new Date(selectedRow.reviewFlag.raisedAt).toLocaleString()}
                    </p>
                    {isApprover && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1 w-full"
                        onClick={() => {
                          setResolveTarget(selectedRow);
                          setResolveNote("");
                        }}
                      >
                        Clear flag
                      </Button>
                    )}
                  </div>
                )}

                {selectedRoomIssues.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-l-4 border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
                    <p className="flex items-center gap-1.5 font-medium">
                      <Wrench className="size-3.5 shrink-0" /> Room problem
                      {selectedRoomIssues.some((issue) => issue.blocksRoom)
                        ? " — out of inventory"
                        : ""}
                    </p>
                    <ul className="space-y-1">
                      {selectedRoomIssues.map((issue) => (
                        <li key={issue._id}>
                          <span className="font-medium capitalize">
                            {issue.category.replace("_", "/")}:
                          </span>{" "}
                          {issue.note}
                        </li>
                      ))}
                    </ul>
                    <p className="text-rose-700/80 dark:text-rose-300/80">
                      Check the room before placing anyone in it — the room team
                      clears the fault when it is fixed.
                    </p>
                  </div>
                )}

                {selectedRow.checkInStatus === "not_arrived" &&
                  selectedRow.assignmentStatus !== "assigned" && (
                    <p className="rounded-lg border border-l-4 border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                      No bed yet — the room-assignment team must assign this
                      delegate before the desk can check them in.
                    </p>
                  )}

                {queuedGuestIds.has(selectedRow.guestId) && (
                  <p className="rounded-lg border border-l-4 border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200">
                    This arrival was taken on this device while offline. It is
                    sent to the server when the station reconnects — do not check
                    the delegate in again.
                  </p>
                )}

                {selectedRow.keyStatus === "pending" &&
                  selectedRow.checkInStatus !== "checked_in" && (
                    <p className="text-xs text-muted-foreground">
                      The key is issued in the check-in step — name the recipient
                      on the next screen.
                    </p>
                  )}

                <div className="space-y-2 pt-1">
                  {selectedRow.checkInStatus === "not_arrived" ? (
                    <Button
                      className="w-full"
                      disabled={
                        busyGuest === selectedRow.guestId ||
                        selectedRow.assignmentStatus !== "assigned" ||
                        queuedGuestIds.has(selectedRow.guestId)
                      }
                      onClick={() => {
                        setCheckinTarget(selectedRow);
                        setOverrideReason("");
                        setKeyRecipientName(selectedRow.name);
                      }}
                    >
                      <UserCheck className="size-4" />
                      Check in
                    </Button>
                  ) : selectedRow.checkInStatus === "checked_in" ? (
                    <>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busyGuest === selectedRow.guestId}
                        onClick={() => {
                          setCheckoutTarget(selectedRow);
                          setKeyReturnStatus("not_applicable");
                        }}
                      >
                        <LogOut className="size-4" /> Check out
                      </Button>
                      {/* The person who made the arrival is the person who can
                          take it back — every desk role, with a reason. */}
                      <Button
                        variant="outline"
                        className="w-full gap-1.5 text-rose-700 hover:text-rose-800 dark:text-rose-400"
                        disabled={busyGuest === selectedRow.guestId}
                        onClick={() => {
                          setUndoTarget(selectedRow);
                          setUndoReason("");
                        }}
                      >
                        <Undo2 className="size-4" /> Undo check-in
                      </Button>
                      {isApprover && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setCorrectTarget(selectedRow);
                            setCorrectReason("");
                          }}
                        >
                          Correct check-in
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="rounded-lg border px-3 py-2 text-center text-sm text-muted-foreground">
                      Checked out — the record stays for audit.
                    </p>
                  )}

                  {selectedRow.checkInStatus === "checked_in" &&
                    (selectedRow.keyStatus === "pending" ||
                      selectedRow.keyStatus === "returned") &&
                    selectedRow.roomId && (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={keyBusy}
                        onClick={() => {
                          setIssueKeyTarget(selectedRow);
                          setIssueKeyRecipient(selectedRow.name);
                        }}
                      >
                        <KeyRound className="size-4" /> Issue key
                      </Button>
                    )}

                  {selectedRow.keyStatus === "issued" && selectedRow.roomId && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={keyBusy}
                      onClick={() => void doReturnKey(selectedRow.roomId as Id<"agcRooms">)}
                    >
                      <KeyRound className="size-4" /> Mark key returned
                    </Button>
                  )}

                  {/* A name that changed hands, or a gender recorded in error, is
                      corrected by the accommodation team — the rep can no
                      longer touch a confirmed reservation, and ordinary desk
                      staff raise a flag instead. */}
                  {isApprover && (
                    <Button
                      variant="ghost"
                      className="w-full gap-1.5"
                      disabled={busyGuest === selectedRow.guestId}
                      onClick={() =>
                        setGuestCorrectTarget({
                          _id: selectedRow.guestId,
                          title: selectedRow.title,
                          firstName: selectedRow.firstName,
                          lastName: selectedRow.lastName,
                          gender: selectedRow.gender,
                          status: "active",
                        })
                      }
                    >
                      <Pencil className="size-4" /> Correct name / gender
                    </Button>
                  )}

                  {/* Venue staff move delegates too: a wrong room is fixed where
                      it is discovered, not after a walk to another table. */}
                  {selectedRow.assignmentStatus === "assigned" &&
                    selectedRow.checkInStatus !== "checked_out" && (
                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                          setRoomChangeTarget(selectedRow);
                          setChangeRoomId("");
                          setChangeReason("");
                        }}
                      >
                        Move delegate
                      </Button>
                    )}

                  {/* Anyone on the desk can ask for a second look at a record;
                      the note is the reason and is required. */}
                  {!selectedRow.reviewFlag && (
                    <Button
                      variant="ghost"
                      className="w-full gap-1.5 text-amber-800 hover:text-amber-900 dark:text-amber-300"
                      disabled={busyGuest === selectedRow.guestId}
                      onClick={() => {
                        setFlagTarget(selectedRow);
                        setFlagNote("");
                      }}
                    >
                      <Flag className="size-4" /> Flag for review
                    </Button>
                  )}
                </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Keyboard advice is noise on a touch screen — it sits exactly where a
          phone user is trying to reach the list. */}
      <p className="hidden text-xs text-muted-foreground sm:block">
        Press <kbd className="rounded border px-1">/</kbd> to jump to search.
        Enter checks in a single ready match. Row colour follows the desk
        legend: green ready, amber blocked, sky already in, slate waiting.
      </p>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium">
          <BedDouble className="size-4 text-muted-foreground" />
          Desk overview &amp; tools
          <span className="text-xs font-normal text-muted-foreground">
            occupancy, group check-in, keys, room faults, offline station and
            sync exceptions
          </span>
          <span className="grow" />
          <StatusLegend tones={["done", "blocked", "info", "waiting"]} />
        </summary>
        <div className="space-y-3 border-t p-3">
          <ArrivalStats data={overview} />
          <div className="grid gap-3 lg:grid-cols-2">
            <GroupCheckInPanel
              hubOptions={hubOptions}
              selectedHub={groupHub}
              onHubChange={(hub) => {
                setGroupHub(hub ?? "");
                setGroupTicked([]);
              }}
              rows={groupRows}
              ticked={groupTicked}
              onTick={tickGroup}
              assignable={tickableInGroup.map((r) => r.guestId)}
              onTickAll={(ids) => setGroupTicked(ids)}
              busy={groupBusy}
              onSubmit={() => void doGroupCheckIn()}
            />
            <div className="space-y-3">
              <OfflinePanel
                sessionToken={sessionToken}
                location={deskLocation}
                isApprover={isApprover}
                queued={queuedCheckIns}
                queueBusy={flushBusy}
                onFlush={() => void flushOfflineCheckIns()}
                canRegister={
                  isApprover || (role === "checkin" && !!assignedBuilding)
                }
              />
              <KeysPanel keys={keys ?? []} sessionToken={sessionToken} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-3">
              <FaultsPanel
                issues={deskIssues}
                rooms={deskRooms}
                sessionToken={sessionToken}
                canOpenRooms={canAccessArea(role, "accommodation")}
              />
              <ReservedPanel rooms={deskRooms} />
            </div>
            <RecentCheckIns data={recent ?? []} />
          </div>
          {isApprover && <ConflictsPanel sessionToken={sessionToken} />}
        </div>
      </details>

      {/* Check-in dialog */}
      <Dialog
        open={checkinTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCheckinTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm arrival — {checkinTarget?.name}</DialogTitle>
            <DialogDescription>
              {checkinTarget?.assignmentStatus !== "assigned"
                ? "No room assignment — refer to Room-Assignment Staff (check-in staff cannot assign rooms)."
                : `${checkinTarget?.roomName}${checkinTarget?.building ? ` · ${checkinTarget.building}` : ""}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {checkinTarget?.roomId &&
              (issuesByRoom.get(checkinTarget.roomId) ?? []).length > 0 && (
                <div className="space-y-1 rounded-lg border border-l-4 border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Wrench className="size-3.5 shrink-0" /> The {checkinTarget.roomName}{" "}
                    room has an open fault
                  </p>
                  {(issuesByRoom.get(checkinTarget.roomId) ?? []).map((issue) => (
                    <p key={issue._id}>
                      <span className="font-medium capitalize">
                        {issue.category.replace("_", "/")}:
                      </span>{" "}
                      {issue.note}
                    </p>
                  ))}
                  <p className="text-rose-700/80 dark:text-rose-300/80">
                    You can still check the delegate in — tell them and ask the
                    room team to fix it.
                  </p>
                </div>
              )}
            {paymentOutstanding && preAuthorizedOverride && (
              <div
                className={cn(
                  "space-y-1 rounded-lg border border-l-4 p-3 text-xs",
                  TONE_SURFACE.done,
                  TONE_RAIL.done,
                )}
              >
                <p className={cn("font-medium", TONE_TEXT.done)}>
                  Payment override pre-authorized
                </p>
                <p className="text-foreground/80">
                  {preAuthorizedOverride.overrideReason}
                </p>
                <p className="text-muted-foreground">
                  Authorized by {preAuthorizedOverride.overrideAuthorizedBy} — check
                  the delegate in on these terms and the override is recorded against
                  the arrival.
                </p>
              </div>
            )}
            {paymentOutstanding && !preAuthorizedOverride && (
              <div
                className={cn(
                  "space-y-1.5 rounded-lg border border-l-4 p-3",
                  TONE_SURFACE.blocked,
                  TONE_RAIL.blocked,
                )}
              >
                <Label className={TONE_TEXT.blocked}>
                  Payment override (Accommodation Admin)
                </Label>
                <Textarea
                  rows={2}
                  placeholder="Reason for checking in without confirmed payment…"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
            )}
            {checkinTarget?.pendingKeyRoom && (
              <div className="space-y-1.5">
                <Label>Key recipient (first arrival in this room/apartment)</Label>
                <Input value={keyRecipientName} onChange={(e) => setKeyRecipientName(e.target.value)} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCheckinTarget(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => void doCheckIn()}
                disabled={
                  busyGuest === checkinTarget?.guestId ||
                  checkinTarget?.assignmentStatus !== "assigned" ||
                  (paymentOutstanding &&
                    !preAuthorizedOverride &&
                    !overrideReason.trim())
                }
              >
                {busyGuest === checkinTarget?.guestId ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <UserCheck className="size-4" />
                )}
                Confirm check-in
              </Button>
            </div>
            {paymentOutstanding && !preAuthorizedOverride && !isApprover && (
              <p className="text-xs text-muted-foreground">
                Ordinary check-in staff cannot authorize overrides (§18). Ask the
                Accommodation Admin to authorize one from the review queue.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Check-out dialog */}
      <Dialog open={checkoutTarget !== null} onOpenChange={(open) => !open && setCheckoutTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Check out — {checkoutTarget?.name}</DialogTitle>
            <DialogDescription>
              Check-out never releases paid inventory (§20).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Key / wristband return</Label>
              <Select value={keyReturnStatus} onValueChange={(value) => setKeyReturnStatus(value ?? "not_applicable")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_applicable">Not applicable (wristband)</SelectItem>
                  <SelectItem value="returned">Key returned</SelectItem>
                  <SelectItem value="not_returned">Key not returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCheckoutTarget(null)}>Cancel</Button>
              <Button onClick={() => void doCheckOut()} disabled={busyGuest === checkoutTarget?.guestId}>
                <LogOut className="size-4" /> Check out
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Correction dialog */}
      <Dialog open={correctTarget !== null} onOpenChange={(open) => !open && setCorrectTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Correct check-in — {correctTarget?.name}</DialogTitle>
            <DialogDescription>
              The erroneous record is kept and marked corrected; all changes are
              audit-logged (§16).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={2}
              placeholder="Why is this check-in record wrong?"
              value={correctReason}
              onChange={(e) => setCorrectReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCorrectTarget(null)}>Cancel</Button>
              <Button
                disabled={!correctReason.trim()}
                onClick={async () => {
                  if (!sessionToken) return;
                  void doCorrect();
                }}
              >
                Apply correction
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Key hand-over — the delegate is already in, the key follows. */}
      <Dialog
        open={issueKeyTarget !== null}
        onOpenChange={(open) => !open && setIssueKeyTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Issue key — {issueKeyTarget?.name}</DialogTitle>
            <DialogDescription>
              Record who physically holds the key for{" "}
              {issueKeyTarget?.roomName ?? "the room"}. One key is open per room,
              so return or replace the current one first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Key recipient</Label>
              <Input
                value={issueKeyRecipient}
                onChange={(e) => setIssueKeyRecipient(e.target.value)}
                placeholder="Who takes the key?"
              />
              <p className="text-xs text-muted-foreground">
                Defaults to the delegate if left blank.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIssueKeyTarget(null)}
                disabled={keyBusy}
              >
                Cancel
              </Button>
              <Button onClick={() => void doIssueKey()} disabled={keyBusy}>
                <KeyRound className="size-4" />
                {keyBusy ? "Issuing…" : "Issue key"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Undo check-in — the arrival is removed, the reason is kept. */}
      <Dialog open={undoTarget !== null} onOpenChange={(open) => !open && setUndoTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Undo check-in — {undoTarget?.name}</DialogTitle>
            <DialogDescription>
              This removes the arrival from {undoTarget?.roomName ?? "the room"} and
              puts the delegate back on the Not Arrived list, so they can be
              checked in again properly. The reason is kept in the audit log;
              any key recorded to this room stays issued until it is marked
              returned.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              rows={2}
              placeholder="Why is this check-in being undone?"
              value={undoReason}
              onChange={(e) => setUndoReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setUndoTarget(null)}
                disabled={undoBusy}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!undoReason.trim() || undoBusy}
                onClick={() => void doUndoCheckIn()}
              >
                <Undo2 className="size-4" />
                {undoBusy ? "Undoing…" : "Undo check-in"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room change dialog */}
      <Dialog open={roomChangeTarget !== null} onOpenChange={(open) => !open && setRoomChangeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move — {roomChangeTarget?.name}</DialogTitle>
            <DialogDescription>
              Destination capacity and gender rules are validated; a reason is
              required and history is preserved (§9).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Destination room</Label>
              <Select value={changeRoomId} onValueChange={(value) => setChangeRoomId(value ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a room…" />
                </SelectTrigger>
                <SelectContent>
                  {(rooms ?? [])
                    .filter(
                      (candidate) =>
                        !candidate.deleted &&
                        // Reserved rooms and rooms out of inventory for a fault
                        // are not destinations.
                        !candidate.faulty &&
                        !candidate.hold &&
                        candidate.accommodationType === roomChangeTarget?.accommodationType &&
                        candidate.name !== roomChangeTarget?.roomName,
                    )
                    .map((candidate) => (
                      <SelectItem key={candidate._id} value={candidate._id}>
                        {candidate.name} · {candidate.available} free
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={2}
              placeholder="Reason for the move…"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoomChangeTarget(null)}>Cancel</Button>
              <Button
                disabled={!changeRoomId || !changeReason.trim() || busyGuest === roomChangeTarget?.guestId}
                onClick={() => void doRoomChange()}
              >
                Move delegate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delegate correction — the desk discovers a wrong name or gender at the
          counter, so the fix happens here rather than in the bookings list. */}
      <GuestCorrectionDialog
        key={guestCorrectTarget?._id ?? "none"}
        guest={guestCorrectTarget}
        sessionToken={sessionToken}
        onClose={() => setGuestCorrectTarget(null)}
      />

      {/* Flag for review dialog — the note is what the reviewer acts on. */}
      <Dialog open={flagTarget !== null} onOpenChange={(open) => !open && setFlagTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag for review — {flagTarget?.name}</DialogTitle>
            <DialogDescription>
              The record stays on the desk and the delegate can still be checked
              in. The Accommodation Admin reads your note and decides.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>What needs checking? (required)</Label>
              <Textarea
                rows={3}
                placeholder="e.g. payment receipt does not match the booking, name on the ID differs…"
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFlagTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={!flagNote.trim() || flagBusy}
                onClick={() => void doFlagRecord()}
              >
                {flagBusy ? <Loader2Icon className="size-4 animate-spin" /> : <Flag className="size-4" />}
                Flag for review
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear the flag — approver only, and the note is the outcome. */}
      <Dialog open={resolveTarget !== null} onOpenChange={(open) => !open && setResolveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear review flag — {resolveTarget?.name}</DialogTitle>
            <DialogDescription>
              Raised by {resolveTarget?.reviewFlag?.raisedBy}: “{resolveTarget?.reviewFlag?.note}”
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Review outcome (required)</Label>
              <Textarea
                rows={3}
                placeholder="e.g. payment verified against the transfer, no further action…"
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResolveTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={!resolveNote.trim() || flagBusy}
                onClick={() => void doResolveFlag()}
              >
                {flagBusy ? <Loader2Icon className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
                Clear flag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

/**
 * Check-in column as the desk reads it: "Not yet" when the delegate is ready,
 * but the blocking reason (no bed, payment first) stays visible in the list so
 * staff do not have to open each record to find out why.
 */
function checkInCell(row: SearchRow): { label: string; className: string } {
  if (row.checkInStatus === "checked_in") {
    return { label: "Checked in", className: "text-emerald-700 dark:text-emerald-400" };
  }
  if (row.checkInStatus === "checked_out") {
    return { label: "Checked out", className: "text-muted-foreground" };
  }
  if (row.assignmentStatus !== "assigned") {
    return { label: "No room", className: "text-amber-800 dark:text-amber-400" };
  }
  const paid =
    row.paymentStatus === "confirmed" || row.poaStatus === "confirmed";
  if (!paid) {
    return { label: "Payment first", className: "text-amber-800 dark:text-amber-400" };
  }
  return { label: "Not yet", className: "text-slate-600 dark:text-slate-400" };
}

/** One label/value line in the delegate detail panel. */
function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 font-medium">{value}</dd>
    </div>
  );
}

type Overview = {
  totalRoomable: number;
  assigned: number;
  unassigned: number;
  checkedIn: number;
  notArrived: number;
  checkedOut: number;
  totalCapacity: number;
  remainingCapacity: number;
  keysIssued: number;
  /** Keys physically back at the desk — the other half of the key count. */
  keysReturned: number;
  unresolvedExceptions: number;
  paymentOverrides: number;
  offlineConflicts: number;
  reviewFlags: number;
  perLocation: {
    accommodationType: string;
    typeLabel: string;
    capacity: number;
    assigned: number;
    checkedIn: number;
    checkedOut: number;
    available: number;
    occupancyPercent: number;
  }[];
};

/**
 * The one-line answer to "is anything waiting on the desk?" — a tinted strip
 * that turns red for sync exceptions and amber for decisions, and collapses
 * to a calm green line when the desk is clear.
 */
function DeskAlerts({
  data,
  reviewQueueHref,
}: {
  data: Overview | undefined;
  /** Where the reviewer works the flagged records; null hides the link. */
  reviewQueueHref?: string | null;
}) {
  if (!data) return null;
  const unassigned = data.unassigned;
  const overrides = data.paymentOverrides;
  const conflicts = data.offlineConflicts;
  const flagged = data.reviewFlags;
  const tone =
    conflicts > 0
      ? "refused"
      : unassigned > 0 || overrides > 0 || flagged > 0
        ? "blocked"
        : "done";
  const Icon = tone === "refused" ? ShieldAlert : tone === "blocked" ? CircleAlert : CircleCheck;
  const headline =
    tone === "refused"
      ? `${conflicts} offline sync exception(s) need review before close-out.`
      : tone === "blocked"
        ? "Some delegates need a decision before they can be checked in."
        : "All clear — nothing is waiting on the desk.";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-l-4 px-3 py-2",
        TONE_SURFACE[tone],
        TONE_RAIL[tone],
      )}
    >
      <p className={cn("flex items-center gap-1.5 text-sm font-medium", TONE_TEXT[tone])}>
        <Icon className="size-4 shrink-0" />
        {headline}
      </p>
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={unassigned > 0 ? "blocked" : "waiting"} icon={BedDouble}>
          {unassigned} unassigned
        </StatusBadge>
        <StatusBadge tone={overrides > 0 ? "blocked" : "waiting"} icon={ShieldAlert}>
          {overrides} payment override(s)
        </StatusBadge>
        <StatusBadge tone={conflicts > 0 ? "refused" : "waiting"} icon={CircleAlert}>
          {conflicts} sync conflict(s)
        </StatusBadge>
        <StatusBadge tone={flagged > 0 ? "blocked" : "waiting"} icon={Flag}>
          {flagged} flagged for review
        </StatusBadge>
        {reviewQueueHref && flagged > 0 && (
          <Link
            href={reviewQueueHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-7 gap-1 text-xs",
            )}
          >
            <Flag className="size-3.5" /> Review the queue
          </Link>
        )}
      </span>
    </div>
  );
}

/**
 * Eight tiles stacked two-up pushed the desk sheet half a screen down on a
 * phone, so below sm they become a swipeable strip; from sm up it is the
 * four/eight-column grid the screens were designed around.
 */
const STAT_STRIP_CLASS =
  "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 xl:grid-cols-8";

/**
 * The numbers the desk is asked for first, in the same small-tile strip the
 * rooms screen uses: arrivals, departures, both directions of the key ledger,
 * and the rooms that must not be handed out. The drawer below keeps the action
 * tiles (overrides, review flags, sync exceptions) for the detailed read.
 */
function DeskStatStrip({
  data,
  reservedRooms,
  reservedBeds,
  faultyRooms,
  activeFilter,
  onSelect,
}: {
  data: Overview | undefined;
  reservedRooms: number;
  reservedBeds: number;
  faultyRooms: number;
  /** The tile currently narrowing the sheet, if any. */
  activeFilter: DeskStatFilter;
  onSelect: (filter: DeskStatFilter) => void;
}) {
  if (!data) {
    return (
      <div
        className={STAT_STRIP_CLASS}
        aria-busy="true"
        aria-label="Loading desk statistics"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-16 rounded-lg max-sm:w-36 max-sm:shrink-0"
          />
        ))}
      </div>
    );
  }

  const stats: Array<{
    label: string;
    value: number;
    hint: string;
    tone: string;
    /** Tiles with a filter narrow the sheet; the rest are read-only. */
    filter?: Exclude<DeskStatFilter, "all">;
    note?: string;
  }> = [
    {
      label: "Checked in",
      value: data.checkedIn,
      hint: `${data.assigned} assigned`,
      tone: "text-emerald-700 dark:text-emerald-400",
      filter: "checked_in",
    },
    {
      label: "Checked out",
      value: data.checkedOut,
      hint: "Beds stay held",
      tone: "text-foreground",
      filter: "checked_out",
    },
    {
      label: "Not arrived",
      value: data.notArrived,
      hint: "Still expected",
      tone:
        data.notArrived > 0
          ? "text-amber-700 dark:text-amber-400"
          : "text-foreground",
      filter: "not_arrived",
    },
    {
      label: "Keys issued",
      value: data.keysIssued,
      hint: "Out with delegates",
      tone: "text-sky-700 dark:text-sky-400",
      filter: "keys_issued",
    },
    {
      label: "Keys returned",
      value: data.keysReturned,
      hint: "Back at the desk",
      tone: "text-foreground",
      filter: "keys_returned",
    },
    {
      label: "Unassigned",
      value: data.unassigned,
      hint: "No bed yet",
      tone:
        data.unassigned > 0
          ? "text-rose-700 dark:text-rose-400"
          : "text-foreground",
      filter: "unassigned",
    },
    {
      label: "Reserved rooms",
      value: reservedRooms,
      hint: `${reservedBeds} bed(s) held`,
      tone: "text-sky-700 dark:text-sky-400",
      note: "Reserved rooms hold no delegates — see the Reserved rooms panel below the sheet.",
    },
    {
      label: "Faulty rooms",
      value: faultyRooms,
      hint: "Out of inventory",
      tone:
        faultyRooms > 0
          ? "text-rose-700 dark:text-rose-400"
          : "text-foreground",
      filter: "faulty",
    },
  ];

  return (
    <div className={STAT_STRIP_CLASS}>
      {stats.map((stat) => {
        const active = !!stat.filter && activeFilter === stat.filter;
        const body = (
          <>
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className={cn("text-lg font-semibold tabular-nums", stat.tone)}>
              {stat.value}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{stat.hint}</p>
          </>
        );
        if (!stat.filter) {
          return (
            <div
              key={stat.label}
              title={stat.note}
              className="rounded-lg border bg-card px-2.5 py-2 max-sm:w-36 max-sm:shrink-0"
            >
              {body}
            </div>
          );
        }
        return (
          <button
            key={stat.label}
            type="button"
            aria-pressed={active}
            title={
              active
                ? "Clear this filter and show the whole sheet"
                : `Show only ${STAT_FILTER_LABEL[stat.filter]} in the sheet`
            }
            onClick={() => onSelect(stat.filter!)}
            className={cn(
              "rounded-lg border bg-card px-2.5 py-2 text-left transition-colors max-sm:w-36 max-sm:shrink-0 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active && "border-primary bg-primary/5 ring-1 ring-primary/40",
            )}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function ArrivalStats({ data }: { data: Overview | undefined }) {
  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  // Action first: only the work that needs a human appears in colour.
  type StatAction = {
    label: string;
    value: number;
    tone: StatusTone;
    hint: string;
    icon: typeof BedDouble;
  };
  const actions: StatAction[] = [
    {
      label: "Unassigned",
      value: data.unassigned,
      tone: data.unassigned > 0 ? "blocked" : "done",
      hint:
        data.unassigned > 0
          ? "Send to Room-Assignment Staff or the Accommodation Admin"
          : "Every roomable delegate has a bed",
      icon: BedDouble,
    },
    {
      label: "Payment overrides",
      value: data.paymentOverrides,
      tone: data.paymentOverrides > 0 ? "blocked" : "done",
      hint:
        data.paymentOverrides > 0
          ? "Checked in without confirmed payment — review the reasons"
          : "No delegate was checked in on an override",
      icon: ShieldAlert,
    },
    {
      label: "Sync exceptions",
      value: data.offlineConflicts,
      tone: data.offlineConflicts > 0 ? "refused" : "done",
      hint:
        data.offlineConflicts > 0
          ? "Resolve these before end of day"
          : "No offline action is in dispute",
      icon: CircleAlert,
    },
  ];

  const progress = [
    { label: "Roomable", value: data.totalRoomable, tone: "neutral" as const },
    { label: "Assigned", value: data.assigned, tone: "info" as const },
    { label: "Checked in", value: data.checkedIn, tone: "done" as const },
    { label: "Not arrived", value: data.notArrived, tone: "waiting" as const },
    { label: "Checked out", value: data.checkedOut, tone: "waiting" as const },
    { label: "Keys out", value: data.keysIssued, tone: "info" as const },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {actions.map((action) => (
          <StatTile
            key={action.label}
            label={action.label}
            value={action.value}
            tone={action.tone}
            hint={action.hint}
            icon={action.icon}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {progress.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                aria-hidden
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  stat.tone === "done"
                    ? "bg-emerald-500"
                    : stat.tone === "info"
                      ? "bg-sky-500"
                      : stat.tone === "waiting"
                        ? "bg-slate-400"
                        : "bg-muted-foreground/40",
                )}
              />
              {stat.label}
            </p>
            <p
              className={cn(
                "text-lg font-semibold tabular-nums",
                stat.tone === "done"
                  ? TONE_TEXT.done
                  : stat.tone === "info"
                    ? TONE_TEXT.info
                    : "text-foreground",
              )}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Occupancy by location (§21)
            </p>
            <p className="text-[11px] text-muted-foreground">
              Green has room · amber is filling · rose is full
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {data.perLocation.map((loc) => {
              const tone = occupancyTone(loc.occupancyPercent);
              return (
                <div
                  key={loc.accommodationType}
                  className={cn(
                    "rounded-lg border border-l-4 p-2 text-xs",
                    TONE_SURFACE[tone],
                    TONE_RAIL[tone],
                  )}
                >
                  <p className="flex items-center justify-between gap-2 font-medium">
                    <span>{loc.typeLabel}</span>
                    <span className={cn("tabular-nums", TONE_TEXT[tone])}>
                      {loc.occupancyPercent}%
                    </span>
                  </p>
                  <p className="text-muted-foreground tabular-nums">
                    {loc.assigned}/{loc.capacity} assigned · {loc.checkedIn} in ·{" "}
                    {loc.available} free
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", TONE_BAR[tone])}
                      style={{ width: `${Math.min(100, loc.occupancyPercent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {data.perLocation.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No rooms imported yet — set up inventory in the Rooms tab.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Group check-in (§13). Pick a hub (or arrival group) from the visible rows,
 * tick ONLY the delegates who physically arrived, and submit. The system
 * never auto-checks-in the unticked members of the group.
 */
function GroupCheckInPanel({
  hubOptions,
  selectedHub,
  onHubChange,
  rows,
  ticked,
  onTick,
  assignable,
  onTickAll,
  busy,
  onSubmit,
}: {
  hubOptions: string[];
  selectedHub: string;
  onHubChange: (hub: string | undefined) => void;
  rows: SearchRow[];
  ticked: string[];
  onTick: (guestId: string, wanted: boolean) => void;
  assignable: string[];
  onTickAll: (guestIds: string[]) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  const allTicked =
    assignable.length > 0 && assignable.every((id) => ticked.includes(id));
  return (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5" /> Group check-in (§13)
        </p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Select
            value={selectedHub}
            onValueChange={(value) => onHubChange(value ?? undefined)}
          >
            <SelectTrigger className="w-56" aria-label="Hub or arrival group">
              <SelectValue placeholder="Choose a hub / arrival group…" />
            </SelectTrigger>
            <SelectContent>
              {hubOptions.map((hub) => (
                <SelectItem key={hub} value={hub}>
                  {hub}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedHub && assignable.length > 0 && (
            <Checkbox
              checked={ticked.length > 0 && allTicked}
              onCheckedChange={(checked) =>
                onTickAll(checked ? assignable : [])
              }
              aria-label="Select all arrived in this hub"
              className="size-8"
            />
          )}
          {selectedHub && (
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={busy || ticked.length === 0}
              onClick={onSubmit}
            >
              {busy ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <UserCheck className="size-3.5" />
              )}
              Check in {ticked.length} arrived
            </Button>
          )}
        </div>
        {!selectedHub ? (
          <p className="text-xs text-muted-foreground">
            Staff select delegates from one hub or arrival group — then tick only
            the arrivals. Unticked delegates stay Not Arrived.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No delegates for {selectedHub} in the current search/desk view.</p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {rows.map((row) => {
              const tickable =
                row.assignmentStatus === "assigned" &&
                row.checkInStatus === "not_arrived";
              const isTicked = ticked.includes(row.guestId);
              return (
                <li
                  key={row.guestId}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs",
                    isTicked && ["border-l-4", TONE_SURFACE.done, TONE_RAIL.done],
                  )}
                >
                  <Checkbox
                    checked={isTicked || !tickable ? true : false}
                    disabled={!tickable}
                    onCheckedChange={(checked) => onTick(row.guestId, checked === true)}
                    aria-label={`Tick arrival for ${row.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="truncate text-muted-foreground">
                      {row.roomName ?? "unassigned"} · {TYPE_LABEL(row.accommodationType)}
                    </p>
                  </div>
                  {!tickable ? (
                    <StatusBadge
                      tone={row.checkInStatus === "checked_in" ? "done" : "waiting"}
                      icon={row.checkInStatus === "checked_in" ? CircleCheck : CircleSlash}
                      className="shrink-0"
                    >
                      {row.checkInStatus === "checked_in" ? "Checked in" : "Not arriving"}
                    </StatusBadge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {selectedHub && ticked.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Only the {ticked.length} ticked delegate(s) will be checked in; every
            other member of {selectedHub} remains Not Arrived.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type RecentRow = {
  _id: string;
  guestName: string;
  roomName: string;
  location: string;
  checkedInAt: number;
  checkedInBy: string;
  override: { reason: string } | null;
  checkedOutAt: number | null;
};

function RecentCheckIns({ data }: { data: RecentRow[] }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="size-3.5" /> Recent check-ins
        </p>
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground">No check-ins yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.map((row) => (
              <li key={row._id} className="text-xs">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  {row.guestName}
                  <StatusBadge
                    tone={row.checkedOutAt ? "waiting" : "done"}
                    icon={row.checkedOutAt ? LogOut : CircleCheck}
                  >
                    {checkInState(row.checkedOutAt ? "checked_out" : "checked_in").label}
                  </StatusBadge>
                  {row.override ? (
                    <StatusBadge tone="refused" icon={ShieldAlert}>
                      Override
                    </StatusBadge>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  {row.roomName} · {new Date(row.checkedInAt).toLocaleString()} · {row.checkedInBy}
                </p>
                {row.override ? (
                  <p className={cn("mt-0.5", TONE_TEXT.refused)}>
                    Override reason: {row.override.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function KeysPanel({
  keys,
  sessionToken,
}: {
  keys: KeyRow[];
  sessionToken: string | null;
}) {
  const returnKey = useMutation(api.agcCheckin.returnKey);
  const replaceKey = useMutation(api.agcCheckin.replaceKey);
  const open = keys.filter((key) => key.status === "issued" || key.status === "replaced");
  // The desk counts both directions: what is out with delegates and what has
  // come back. "Out" is the number to reconcile against the physical board.
  const returned = keys.filter((key) => key.status === "returned").length;
  return (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <KeyRound className="size-3.5" /> Keys — {open.length} out · {returned}{" "}
          returned
          <span className="font-normal">
            ({keys.length} key record{keys.length === 1 ? "" : "s"} in total)
          </span>
        </p>
        {open.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No keys currently issued. Lodges and EBPV apartments track keys; wristbands are not tracked (§14).
          </p>
        ) : (
          <ul className="space-y-1.5">
            {open.map((key) => (
              <li key={key._id} className="text-xs">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  {key.roomName}{" "}
                  <span className="font-normal text-muted-foreground">· {key.typeLabel}</span>
                  <StatusBadge
                    tone={
                      key.status === "returned"
                        ? "done"
                        : key.status === "replaced"
                          ? "info"
                          : "blocked"
                    }
                    icon={KeyRound}
                  >
                    {key.status === "returned"
                      ? "Returned"
                      : key.status === "replaced"
                        ? "Replaced"
                        : "Key out"}
                  </StatusBadge>
                </p>
                <p className="text-muted-foreground">
                  {key.recipientName ?? "—"} · {key.status} ·{" "}
                  {key.replacedAt ?? key.issuedAt
                    ? new Date((key.replacedAt ?? key.issuedAt) as number).toLocaleString()
                    : "—"}
                </p>
                {sessionToken && (
                  <div className="mt-1 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={async () => {
                        try {
                          await replaceKey({ sessionToken, roomId: key.roomId as Id<"agcRooms"> });
                          toast.success("Key marked replaced.");
                        } catch (err) {
                          toast.error(...toastFriendlyErrorParts(err, "Could not replace key"));
                        }
                      }}
                    >
                      Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={async () => {
                        try {
                          await returnKey({ sessionToken, roomId: key.roomId as Id<"agcRooms"> });
                          toast.success("Key marked returned.");
                        } catch (err) {
                          toast.error(...toastFriendlyErrorParts(err, "Could not mark returned"));
                        }
                      }}
                    >
                      Returned
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Every room that is out of service right now, without opening a delegate.
 * The desk needs to know which beds it cannot use before the queue forms — a
 * blocking fault removes the room from the inventory the moment it is raised.
 */
function FaultsPanel({
  issues,
  rooms,
  sessionToken,
  canOpenRooms,
}: {
  issues: Array<{
    _id: string;
    roomId: string;
    roomName: string;
    accommodationType: string;
    building: string | null;
    category: string;
    note: string;
    blocksRoom: boolean;
    reportedAt: number;
    reportedBy: string;
  }>;
  /** Rooms the desk may raise a fault against. */
  rooms: Array<{
    _id: string;
    name: string;
    accommodationType: string;
    building: string | null;
    faulty?: boolean;
  }>;
  sessionToken: string | null;
  /** Room-assignment/accommodation staff can fix these on the rooms screen. */
  canOpenRooms: boolean;
}) {
  const outOfService = issues.filter((issue) => issue.blocksRoom);
  const otherOpen = issues.length - outOfService.length;

  // Anyone on the desk can raise a fault: the person who finds a broken toilet
  // is standing in the room, not in front of the rooms grid.
  const flagRoomIssue = useMutation(api.agcRoomIssues.flagRoom);
  const [faultOpen, setFaultOpen] = useState(false);
  const [faultRoomId, setFaultRoomId] = useState("");
  const [faultCategory, setFaultCategory] = useState<RoomIssueCategory>("toilet");
  const [faultNote, setFaultNote] = useState("");
  const [faultBlocks, setFaultBlocks] = useState(true);
  const [faultBusy, setFaultBusy] = useState(false);

  const roomOptions = useMemo(
    () => [...rooms].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [rooms],
  );

  const submitFault = async () => {
    if (!sessionToken || !faultRoomId) return;
    if (!faultNote.trim()) {
      toast.error("Describe the problem so maintenance knows what to fix.");
      return;
    }
    setFaultBusy(true);
    try {
      const result = await flagRoomIssue({
        sessionToken,
        roomId: faultRoomId as Id<"agcRooms">,
        category: faultCategory,
        note: faultNote.trim(),
        blocksRoom: faultBlocks,
      });
      const roomName = roomOptions.find((room) => room._id === faultRoomId)?.name ?? "Room";
      toast.success(
        result.created
          ? faultBlocks
            ? `${roomName} flagged — out of inventory until it is fixed.`
            : `${roomName} flagged — the room team sees it on the rooms screen.`
          : `${roomName} already has that fault open.`,
      );
      setFaultOpen(false);
      setFaultRoomId("");
      setFaultNote("");
      setFaultCategory("toilet");
      setFaultBlocks(true);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Could not flag the room"));
    } finally {
      setFaultBusy(false);
    }
  };

  return (
    <>
    <Card>
      <CardContent className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Wrench className="size-3.5" /> Out of service ({outOfService.length})
          {otherOpen > 0 && (
            <span className="font-normal">
              · {otherOpen} other open fault{otherOpen === 1 ? "" : "s"} don&apos;t block a room
            </span>
          )}
          <span className="grow" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs text-rose-700 hover:text-rose-800 dark:text-rose-400"
            disabled={!sessionToken || roomOptions.length === 0}
            onClick={() => {
              setFaultRoomId("");
              setFaultCategory("toilet");
              setFaultNote("");
              setFaultBlocks(true);
              setFaultOpen(true);
            }}
          >
            <Flag className="size-3" /> Flag a room
          </Button>
        </div>
        {outOfService.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every room is in service — nothing is withdrawn from the inventory.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {outOfService.map((issue) => (
              <li
                key={issue._id}
                className={cn(
                  "space-y-0.5 rounded-lg border border-l-4 px-2.5 py-1.5 text-xs",
                  TONE_SURFACE.blocked,
                  "border-rose-200 dark:border-rose-900/70",
                )}
              >
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {issue.roomName}
                  <span className="font-normal text-muted-foreground">
                    {TYPE_LABEL(issue.accommodationType)}
                    {issue.building ? ` · ${issue.building}` : ""}
                  </span>
                  <span className="rounded bg-rose-200/70 px-1 text-[10px] font-medium uppercase tracking-wide dark:bg-rose-900/60">
                    {ROOM_ISSUE_LABEL[issue.category] ?? issue.category}
                  </span>
                </p>
                <p className="leading-snug">{issue.note}</p>
                <p className="text-muted-foreground">
                  Raised by {issue.reportedBy} ·{" "}
                  {new Date(issue.reportedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canOpenRooms && outOfService.length > 0 && (
          <Link
            href="/admin/accommodation?tab=rooms"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-2 h-7 gap-1.5 text-xs",
            )}
          >
            <Wrench className="size-3" /> Fix on the rooms screen
          </Link>
        )}
      </CardContent>
    </Card>

      {/* Raise a fault from the desk — the person who finds it reports it. */}
      <Dialog open={faultOpen} onOpenChange={setFaultOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Flag a room fault</DialogTitle>
            <DialogDescription>
              Record what is wrong. “Take out of inventory” keeps the room out of
              every assignment until the room team marks it fixed; without it the
              fault is only a note on the room.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Room</Label>
              <Select
                value={faultRoomId}
                onValueChange={(value) => setFaultRoomId(value ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose the room…" />
                </SelectTrigger>
                <SelectContent>
                  {roomOptions.map((room) => (
                    <SelectItem key={room._id} value={room._id}>
                      {room.name} · {TYPE_LABEL(room.accommodationType)}
                      {room.faulty ? " · already out of service" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>What is wrong</Label>
              <Select
                value={faultCategory}
                onValueChange={(value) =>
                  setFaultCategory((value ?? "other") as RoomIssueCategory)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_ISSUE_KEYS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {ROOM_ISSUE_LABEL[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Details (required)</Label>
              <Textarea
                value={faultNote}
                onChange={(e) => setFaultNote(e.target.value)}
                placeholder="e.g. Toilet will not flush; no running water in the bathroom"
                rows={3}
                aria-label="Room fault details"
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm">
              <Checkbox
                checked={faultBlocks}
                onCheckedChange={(checked) => setFaultBlocks(checked === true)}
                className="mt-0.5"
                aria-label="Take this room out of inventory until it is fixed"
              />
              <span>
                <span className="block font-medium">Take out of inventory</span>
                <span className="block text-xs text-muted-foreground">
                  The room cannot be assigned until the fault is fixed. Leave this
                  unticked for a note that does not withdraw the room.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setFaultOpen(false)}
                disabled={faultBusy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitFault()}
                disabled={faultBusy || !faultRoomId || !faultNote.trim()}
              >
                {faultBusy ? (
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
    </>
  );
}

/**
 * Rooms held by the room team, shown for information only. The desk cannot
 * assign into a reserved room — it is excluded from every picker — but staff
 * still need to know the bed exists and why it is being held before promising
 * it to someone who turns up.
 */
function ReservedPanel({ rooms }: { rooms: AdminRoomRow[] }) {
  const reserved = rooms
    .filter((room) => room.hold)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock className="size-3.5" /> Reserved rooms ({reserved.length})
        </p>
        {reserved.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No rooms are reserved — every bed is in the live inventory.
          </p>
        ) : (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {reserved.map((room) => (
              <li
                key={room._id}
                className="rounded-lg border border-l-4 border-sky-200 bg-sky-50/70 px-2.5 py-1.5 text-xs text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200"
              >
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {room.name}
                  <span className="font-normal text-muted-foreground">
                    {TYPE_LABEL(room.accommodationType)}
                    {room.building ? ` · ${room.building}` : ""}
                  </span>
                </p>
                {room.hold && (
                  <p className="text-sky-800/80 dark:text-sky-200/80">
                    {room.hold.note} — {room.hold.by},{" "}
                    {new Date(room.hold.at).toLocaleDateString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Held rooms are not offered at check-in; ask the room team to release
          one if the beds are needed.
        </p>
      </CardContent>
    </Card>
  );
}

function OfflinePanel({
  sessionToken,
  location,
  isApprover,
  queued,
  queueBusy,
  onFlush,
  canRegister,
}: {
  sessionToken: string | null;
  location: string;
  isApprover: boolean;
  /** Arrivals taken on this device that have not reached the server yet. */
  queued: QueuedDeskCheckIn[];
  queueBusy: boolean;
  onFlush: () => void;
  /** Approvers, and a posted check-in desk claiming its own building. */
  canRegister: boolean;
}) {
  const stations = useQuery(api.agcOffline.listStations, sessionToken ? {} : "skip");
  const registerStation = useMutation(api.agcOffline.registerStation);
  const syncNow = useMutation(api.agcOffline.syncPendingTransactions);
  const station = (stations ?? []).find((s) => s.active && s.building === location);

  const [registering, setRegistering] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const isBuilding = location !== "central";

  // Live connectivity marker.
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <WifiOff className="size-3.5" /> Offline station (§19)
        </p>
        {!isBuilding ? (
          <p className="text-xs text-muted-foreground">
            Pick a building above to designate or view this device as that building&apos;s
            offline station. The central desk is always online.
          </p>
        ) : (
          <div className="space-y-2 text-xs">
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge
                tone={online ? "done" : "blocked"}
                icon={online ? CircleCheck : WifiOff}
              >
                {online ? "Online" : "Offline"}
              </StatusBadge>
              {station ? (
                <span>
                  Designated: <strong>{station.stationName}</strong> · {station.pendingTransactions} pending
                  {station.lastSuccessfulSync
                    ? ` · last sync ${new Date(station.lastSuccessfulSync).toLocaleString()}`
                    : ""}
                  {station.conflicts > 0 ? (
                    <span className={TONE_TEXT.refused}>
                      {" "}
                      · {station.conflicts} conflicts
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  No designated station for {location} yet.
                </span>
              )}
            </p>
            {(isApprover || !station) && (
              <div className="flex gap-1.5">
                {canRegister && !station && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={registering}
                    onClick={async () => {
                      setRegistering(true);
                      try {
                        await registerStation({
                          sessionToken: sessionToken!,
                          building: location,
                          stationName: `Station ${location}`,
                        });
                        toast.success("This device registered as the designated station.");
                      } catch (err) {
                        toast.error(...toastFriendlyErrorParts(err, "Could not register"));
                      } finally {
                        setRegistering(false);
                      }
                    }}
                  >
                    Designate this device
                  </Button>
                )}
                {station && online && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={syncing || station.pendingTransactions === 0}
                    onClick={async () => {
                      setSyncing(true);
                      try {
                        const result = await syncNow({ sessionToken: sessionToken!, building: location });
                        toast.success(
                          `Sync: ${result.applied} applied, ${result.conflicts} flagged for review.`,
                        );
                      } catch (err) {
                        toast.error(...toastFriendlyErrorParts(err, "Sync failed"));
                      } finally {
                        setSyncing(false);
                      }
                    }}
                  >
                    {syncing ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                    Sync now
                  </Button>
                )}
              </div>
            )}
            {queued.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-sky-200 bg-sky-50/70 px-2 py-1.5 text-[11px] text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200">
                <p className="flex flex-wrap items-center gap-1.5">
                  <WifiOff className="size-3 shrink-0" />
                  {queued.length} check-in{queued.length === 1 ? "" : "s"} held on
                  this device
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto h-6 gap-1 px-2 text-[11px]"
                    disabled={queueBusy}
                    onClick={onFlush}
                  >
                    {queueBusy ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    {online ? "Push and sync" : "Queued — send when online"}
                  </Button>
                </p>
                {/* Names, so the desk can read what is waiting before it goes: a
                    count alone does not tell staff whether the right people are
                    in it. */}
                <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                  {[...queued]
                    .sort((a, b) => a.originalAt - b.originalAt)
                    .map((entry) => (
                      <li
                        key={entry.txId}
                        className="flex flex-wrap items-baseline gap-1"
                      >
                        <span className="font-medium">
                          {entry.guestName || "Delegate"}
                        </span>
                        {entry.roomName ? (
                          <span className="text-sky-800/80 dark:text-sky-200/80">
                            · {entry.roomName}
                          </span>
                        ) : null}
                        {entry.building !== location ? (
                          <span className="text-sky-800/80 dark:text-sky-200/80">
                            · {entry.building}
                          </span>
                        ) : null}
                        <span className="ml-auto tabular-nums">
                          {new Date(entry.originalAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="text-sky-800/80 dark:text-sky-200/80">
                  Sent in this order when the station syncs. Nothing here has
                  reached the server yet.
                </p>
              </div>
            )}
            {!online && (
              <p className={TONE_TEXT.blocked}>
                Offline mode: check-ins taken at this desk are kept on the device
                and sent automatically when the connection returns.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConflictsPanel({ sessionToken }: { sessionToken: string | null }) {
  const conflicts = useQuery(api.agcOffline.listConflicts, sessionToken ? { sessionToken } : "skip");
  const resolve = useMutation(api.agcOffline.resolveConflict);
  const rows = conflicts ?? [];
  return (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CircleAlert className={cn("size-3.5", rows.length > 0 ? TONE_TEXT.refused : "")} />
          Offline sync exceptions ({rows.length})
        </p>            {rows.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleCheck className="size-3.5 text-emerald-600" /> No conflicts or
                rejections to review.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((c: ConflictRow) => (
                  <li
                    key={c._id}
                    className={cn(
                      "rounded-lg border border-l-4 p-2 text-xs",
                      TONE_SURFACE.refused,
                      TONE_RAIL.refused,
                    )}
                  >
                <p className="font-medium">
                  {c.action} · {c.building} · {c.syncStatus}
                </p>
                <p className="text-muted-foreground">{c.conflictReason}</p>
                <div className="mt-1 flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={async () => {
                      try {
                        await resolve({
                          sessionToken: sessionToken!,
                          transactionId: c._id as Id<"agcOfflineTransactions">,
                          resolution: "applied",
                        });
                        toast.success("Conflict closed as applied.");
                      } catch (err) {
                        toast.error(...toastFriendlyErrorParts(err, "Could not resolve"));
                      }
                    }}
                  >
                    Mark applied
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-destructive"
                    onClick={async () => {
                      try {
                        await resolve({
                          sessionToken: sessionToken!,
                          transactionId: c._id as Id<"agcOfflineTransactions">,
                          resolution: "rejected",
                        });
                        toast.success("Conflict closed as rejected.");
                      } catch (err) {
                        toast.error(...toastFriendlyErrorParts(err, "Could not resolve"));
                      }
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
