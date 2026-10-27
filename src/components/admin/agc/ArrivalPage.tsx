"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  ListChecks,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
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
  occupants: number;
  assignments: { _id: string; guestId: string; bookingId: string }[];
};

type SearchRow = {
  guestId: string;
  bookingId: string;
  name: string;
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

export function ArrivalPage() {
  const { sessionToken, user } = useAdminSession();
  const role = user?.role ?? "";
  const isApprover = role === "admin" || role === "accommodation";

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
    sessionToken ? { sessionToken, location: location === "central" ? undefined : location } : "skip",
  );

  const checkInGuest = useMutation(api.agcCheckin.checkInGuest);
  const checkInGroup = useMutation(api.agcCheckin.checkInGroup);
  const checkOutGuest = useMutation(api.agcCheckin.checkOutGuest);
  const correctCheckIn = useMutation(api.agcCheckin.correctCheckIn);
  const flagCheckInRecord = useMutation(api.agcCheckin.flagCheckInRecord);
  const resolveCheckinFlag = useMutation(api.agcCheckin.resolveCheckinFlag);
  const changeRoom = useMutation(api.agcRoomAssignments.changeRoom);
  const returnRoomKey = useMutation(api.agcCheckin.returnKey);
  const [keyBusy, setKeyBusy] = useState(false);
  const publishedRooms = useQuery(
    api.agcRoomAssignments.listRoomsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const rooms = useMemo(
    () =>
      (publishedRooms ?? []).map((room: AdminRoomRow) => ({
        _id: room._id,
        accommodationType: room.accommodationType,
        name: room.name,
        available: room.capacity - room.occupants,
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
  const [correctTarget, setCorrectTarget] = useState<SearchRow | null>(null);
  const [correctReason, setCorrectReason] = useState("");
  const [flagTarget, setFlagTarget] = useState<SearchRow | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [resolveTarget, setResolveTarget] = useState<SearchRow | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const [roomChangeTarget, setRoomChangeTarget] = useState<SearchRow | null>(null);
  const [changeRoomId, setChangeRoomId] = useState<string>("");
  const [changeReason, setChangeReason] = useState("");

  // --- Group check-in (§13) ---
  const [groupHub, setGroupHub] = useState<string>("");
  const [groupTicked, setGroupTicked] = useState<string[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);

  const doCheckIn = async () => {
    if (!sessionToken || !checkinTarget) return;
    setBusyGuest(checkinTarget.guestId);
    try {
      const result = await checkInGuest({
        sessionToken,
        guestId: checkinTarget.guestId as Id<"agcGuests">,
        location,
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
      toast.error(...toastFriendlyErrorParts(err, "Check-in failed"));
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
  }, [baseRows, genderFilter, hubFilter, typeFilter]);

  const selectedRow = useMemo(
    () => rosterRows.find((row) => row.guestId === selectedGuestId) ?? null,
    [rosterRows, selectedGuestId],
  );

  const filtersActive =
    genderFilter !== "any" || hubFilter !== "all" || typeFilter !== "all";
  const clearFilters = () => {
    setGenderFilter("any");
    setHubFilter("all");
    setTypeFilter("all");
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
    return deskRowState(row).ready ? row : null;
  }, [rosterRows]);

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
    setGroupBusy(true);
    try {
      const result = await checkInGroup({
        sessionToken,
        location,
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hub: Any</SelectItem>
              {hubOptions.map((hub) => (
                <SelectItem key={hub} value={hub}>
                  Hub: {hub}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "all")}>
            <SelectTrigger
              className="h-8 w-auto min-w-36 gap-1 rounded-full px-3 text-xs"
              aria-label="Filter by room type"
            >
              <SelectValue />
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

          <Select value={location} onValueChange={(value) => setLocation(value ?? "central")}>
            <SelectTrigger
              className="h-8 w-auto min-w-36 gap-1 rounded-full px-3 text-xs"
              aria-label="Desk location"
            >
              <SelectValue />
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
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
                {rosterRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      {filtersActive || search
                        ? "No delegate matches these filters — clear them to see the full sheet."
                        : "No delegates on the desk yet — rooms and bookings feed this sheet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rosterRows.map((row) => {
                    const selected = row.guestId === selectedGuestId;
                    const cell = checkInCell(row);
                    return (
                      <TableRow
                        key={row.guestId}
                        onClick={() => setSelectedGuestId(row.guestId)}
                        aria-selected={selected}
                        className={cn(
                          "cursor-pointer",
                          selected ? "bg-sky-50 dark:bg-sky-950/40" : "hover:bg-muted/50",
                        )}
                      >
                        <TableCell className="font-medium tabular-nums">
                          {row.roomName ?? "—"}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.bedNumber ?? "—"}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedGuestId(row.guestId);
                            }}
                            className={cn(
                              "text-left font-semibold underline decoration-dotted underline-offset-4 hover:decoration-solid",
                              selected && "text-sky-800 dark:text-sky-300",
                            )}
                          >
                            {row.name}
                          </button>
                          {row.assignmentStatus !== "assigned" && (
                            <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Unassigned
                            </span>
                          )}
                          {row.reviewFlag && (
                            <span
                              title={`Flagged for review by ${row.reviewFlag.raisedBy}: ${row.reviewFlag.note}`}
                              className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            >
                              <Flag className="size-2.5" /> Review
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden capitalize sm:table-cell">{row.gender}</TableCell>
                        <TableCell className="hidden md:table-cell">{row.hubName}</TableCell>
                        <TableCell className={cn("text-sm font-medium", cell.className)}>
                          {cell.label}
                        </TableCell>
                        <TableCell className="hidden text-sm sm:table-cell">
                          {row.keyStatus ? KEY_LABEL[row.keyStatus] : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardContent className="p-4">
            {!selectedRow ? (
              <div className="py-10 text-center">
                <UserCheck className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Select a delegate</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click a name to see the room, payment and key, then check them in.
                </p>
              </div>
            ) : (
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
                  <DetailLine label="Status" value={deskRowState(selectedRow).label} />
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

                {selectedRow.checkInStatus === "not_arrived" &&
                  selectedRow.assignmentStatus !== "assigned" && (
                    <p className="rounded-lg border border-l-4 border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                      No bed yet — the room-assignment team must assign this
                      delegate before the desk can check them in.
                    </p>
                  )}

                {selectedRow.keyStatus === "pending" && (
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
                        selectedRow.assignmentStatus !== "assigned"
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

                  {role !== "checkin" &&
                    selectedRow.assignmentStatus === "assigned" &&
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
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Press <kbd className="rounded border px-1">/</kbd> to jump to search.
        Enter checks in a single ready match. Row colour follows the desk
        legend: green ready, amber blocked, sky already in, slate waiting.
      </p>

      <details className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-sm font-medium">
          <BedDouble className="size-4 text-muted-foreground" />
          Desk overview &amp; tools
          <span className="text-xs font-normal text-muted-foreground">
            occupancy, group check-in, keys, offline station and sync exceptions
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
              <OfflinePanel sessionToken={sessionToken} location={location} isApprover={isApprover} />
              <KeysPanel keys={keys ?? []} sessionToken={sessionToken} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <RecentCheckIns data={recent ?? []} />
            {isApprover && <ConflictsPanel sessionToken={sessionToken} />}
          </div>
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
  return (
    <Card>
      <CardContent className="p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <KeyRound className="size-3.5" /> Keys out ({open.length})
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

function OfflinePanel({
  sessionToken,
  location,
  isApprover,
}: {
  sessionToken: string | null;
  location: string;
  isApprover: boolean;
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
                {isApprover && !station && (
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
            {!online && (
              <p className={TONE_TEXT.blocked}>
                Offline mode: actions taken at this desk while disconnected are kept in
                the local queue and replay automatically when the connection returns.
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
