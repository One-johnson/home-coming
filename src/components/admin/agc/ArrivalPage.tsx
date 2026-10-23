"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BedDouble,
  CircleAlert,
  CircleCheck,
  CircleSlash,
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
import { Button } from "@/components/ui/button";
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
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import {
  TONE_BAR,
  TONE_RAIL,
  TONE_ROW,
  TONE_SURFACE,
  TONE_TEXT,
  buildingChipClass,
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
  roomName: string | null;
  building: string | null;
  checkInStatus: "checked_in" | "checked_out" | "not_arrived";
  checkInId: string | null;
  checkedInAt: number | null;
  checkedInBy: string | null;
  checkedOutAt: number | null;
  pendingKeyRoom: boolean;
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

  // Search state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
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
  const changeRoom = useMutation(api.agcRoomAssignments.changeRoom);
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

  const rows = useMemo(() => {
    // The searchable list: search first, else the grounded desk sheet.
    return  searchResults ?? deskRows ?? [];
  }, [searchResults, deskRows]);

  /**
   * A single match that is ready to check in: Enter at the desk then works
   * without reaching for the mouse. Anything else still goes through its row.
   */
  const soleReadyRow = useMemo(() => {
    if (rows.length !== 1) return null;
    const row = rows[0] as SearchRow;
    return deskRowState(row).ready ? row : null;
  }, [rows]);

  // --- Group check-in (§13) ---
  const groupRows = useMemo(() => {
    if (!groupHub) return [];
    return (rows as SearchRow[]).filter((row) => row.hubName === groupHub);
  }, [rows, groupHub]);
  const hubOptions = useMemo(
    () => [...new Set((rows as SearchRow[]).map((row) => row.hubName))].sort(),
    [rows],
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

  return (
    <div className="space-y-4">
      <ArrivalStats data={overview} />
      <DeskAlerts data={overview} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={location} onValueChange={(value) => setLocation(value ?? "central")}>
              <SelectTrigger className="w-52" aria-label="Desk location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="central">Central check-in desk</SelectItem>
                {[
                  ...new Set(
                    (deskRows ?? [])
                      .map((row) => row.building)
                      .filter((b): b is string => typeof b === "string"),
                  ),
                ].map((building) => (
                  <SelectItem key={building} value={building}>
                    {building}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="search"
                placeholder="Search delegate name or hub… (2+ characters, “/” focuses, Enter checks in a single ready match)"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !soleReadyRow) return;
                  event.preventDefault();
                  setCheckinTarget(soleReadyRow);
                  setOverrideReason("");
                  setKeyRecipientName(soleReadyRow.name);
                }}
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "all")}>
              <SelectTrigger className="w-44" aria-label="Accommodation type filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {TYPE_KEYS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_LABEL(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusLegend tones={["done", "blocked", "info", "waiting"]} />
            <p className="text-[11px] text-muted-foreground">
              Row colour = what the delegate needs next.
            </p>
          </div>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delegate</TableHead>
                    <TableHead className="hidden sm:table-cell">Hub</TableHead>
                    <TableHead className="hidden md:table-cell">Room</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No delegates match — search by name or hub (min 2 characters).
                      </TableCell>
                    </TableRow>
                  ) : (
                    (rows as SearchRow[]).map((row) => {
                      const alreadyIn = row.checkInStatus === "checked_in";
                      const gone = row.checkInStatus === "checked_out";
                      const state = deskRowState(row);
                      const payment = paymentState(row.paymentStatus, row.poaStatus);
                      const StatusIcon =
                        state.tone === "done"
                          ? UserCheck
                          : state.tone === "blocked"
                            ? CircleAlert
                            : state.tone === "info"
                              ? CircleCheck
                              : gone
                                ? LogOut
                                : CircleSlash;
                      return (
                        <TableRow
                          key={row.guestId}
                          className={cn(
                            "border-l-4",
                            TONE_RAIL[state.tone],
                            TONE_ROW[state.tone],
                          )}
                        >
                          <TableCell>
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.gender} · {TYPE_LABEL(row.accommodationType)}
                              {row.bookingRef ? ` · ${row.bookingRef}` : ""}
                            </p>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">{row.hubName}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {row.roomName ? (
                              <span>
                                {row.roomName}
                                {row.building ? (
                                  <span
                                    className={cn(
                                      "ml-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                                      buildingChipClass(row.building),
                                    )}
                                  >
                                    {row.building}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <StatusBadge tone="blocked" icon={BedDouble}>
                                Unassigned — refer to room staff
                              </StatusBadge>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={payment.tone}
                              icon={payment.tone === "done" ? CircleCheck : CircleAlert}
                              title={payment.detail}
                            >
                              {payment.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={state.tone} icon={StatusIcon}>
                              {state.label}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {alreadyIn ? (
                                <>
                                  {isApprover && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setCorrectTarget(row);
                                        setCorrectReason("");
                                      }}
                                    >
                                      Correct
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={busyGuest === row.guestId}
                                    onClick={() => {
                                      setCheckoutTarget(row);
                                      setKeyReturnStatus("not_applicable");
                                    }}
                                  >
                                    <LogOut className="size-3" /> Check out
                                  </Button>
                                </>
                              ) : gone ? null : (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={busyGuest === row.guestId || row.assignmentStatus !== "assigned"}
                                  onClick={() => {
                                    setCheckinTarget(row);
                                    setOverrideReason("");
                                    setKeyRecipientName(row.name);
                                  }}
                                >
                                  <UserCheck className="size-3" /> Check in
                                </Button>
                              )}
                              {row.assignmentStatus === "assigned" && !gone && role !== "checkin" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setRoomChangeTarget(row);
                                    setChangeRoomId("");
                                    setChangeReason("");
                                  }}
                                >
                                  Move
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <GroupCheckInPanel
            hubOptions={hubOptions}
            selectedHub={groupHub}
            onHubChange={(hub) => {
              setGroupHub(hub ?? "");
              setGroupTicked([]);
            }}
            rows={groupRows as SearchRow[]}
            ticked={groupTicked}
            onTick={tickGroup}
            assignable={tickableInGroup.map((r) => r.guestId)}
            onTickAll={(ids) => setGroupTicked(ids)}
            busy={groupBusy}
            onSubmit={() => void doGroupCheckIn()}
          />
        </div>

        <div className="space-y-3">
          <OfflinePanel sessionToken={sessionToken} location={location} isApprover={isApprover} />
          <KeysPanel keys={keys ?? []} sessionToken={sessionToken} />
          <RecentCheckIns data={recent ?? []} />
          {(isApprover) && <ConflictsPanel sessionToken={sessionToken} />}
        </div>
      </div>

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
            {checkinTarget &&
              checkinTarget.paymentStatus !== "confirmed" &&
              checkinTarget.poaStatus !== "confirmed" && (
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
                  (checkinTarget != null &&
                    checkinTarget.paymentStatus !== "confirmed" &&
                    checkinTarget.poaStatus !== "confirmed" &&
                    !overrideReason.trim() &&
                    !isApprover) ||
                  (checkinTarget != null &&
                    checkinTarget.paymentStatus !== "confirmed" &&
                    checkinTarget.poaStatus !== "confirmed" &&
                    isApprover &&
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
            {checkinTarget &&
              checkinTarget.paymentStatus !== "confirmed" &&
              checkinTarget.poaStatus !== "confirmed" &&
              !isApprover && (
                <p className="text-xs text-muted-foreground">
                  Ordinary check-in staff cannot authorize overrides (§18).
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
    </div>
  );
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

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
function DeskAlerts({ data }: { data: Overview | undefined }) {
  if (!data) return null;
  const unassigned = data.unassigned;
  const overrides = data.paymentOverrides;
  const conflicts = data.offlineConflicts;
  const tone = conflicts > 0 ? "refused" : unassigned > 0 || overrides > 0 ? "blocked" : "done";
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
