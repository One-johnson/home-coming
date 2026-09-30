"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  InboxIcon,
  KeyRound,
  Mail,
  SearchIcon,
  PowerOff,
  UserX,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/portal/StatTile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HUB_FILTERS,
  HUB_SORTS,
  QUIET_TONE_CLASS,
  hubAvatarClass,
  hubInitials,
  hubMatchesSearch,
  hubRosterSummary,
  matchesHubFilter,
  quietLabel,
  quietTone,
  sortHubRows,
} from "@/lib/hubRosterView";
import type { HubFilterId, HubRosterRow, HubSortId } from "@/lib/hubRosterView";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type HubRow = HubRosterRow;

function RepStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "active"
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : status === "disabled"
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-amber-300 bg-amber-50 text-amber-800"
      }
    >
      {status === "pending_setup" ? "pending setup" : status}
    </Badge>
  );
}

function HubAvatar({ hubName, large = false }: { hubName: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        large ? "size-10 text-sm" : "size-8 text-[11px]",
        hubAvatarClass(hubName),
      )}
    >
      {hubInitials(hubName)}
    </span>
  );
}

function QuietBadge({ hub }: { hub: HubRow }) {
  const hasActivity =
    hub.registrations.lastActivityAt > 0 || hub.bookings.lastActivityAt > 0;
  const tone = quietTone(hub.inactiveDays, hasActivity);
  return (
    <Badge variant="outline" className={QUIET_TONE_CLASS[tone]}>
      {quietLabel(hub.inactiveDays, hasActivity)}
    </Badge>
  );
}

/** Column number with an amber "awaiting" pip underneath when work is pending. */
function StatCell({
  value,
  pending,
  pendingLabel,
}: {
  value: number;
  pending: number;
  pendingLabel: string;
}) {
  return (
    <div className="text-right">
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {pending > 0 ? (
        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {pending} {pendingLabel}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">—</p>
      )}
    </div>
  );
}

/**
 * Inline rep actions for the detail panel: enable/disable the account and
 * issue fresh credentials (new temp password, invalidates the old one).
 */
function RepActions({
  rep,
  onCredentials,
}: {
  rep: NonNullable<HubRow["rep"]>;
  onCredentials: (text: string) => void;
}) {
  const { sessionToken } = useAdminSession();
  const setRepStatus = useMutation(api.agcAdminData.setRepStatus);
  const issueTempPassword = useAction(api.agcAdmin.issueTempPassword);
  const [busy, setBusy] = useState(false);

  const toggleStatus = async () => {
    if (!sessionToken || busy) return;
    setBusy(true);
    try {
      await setRepStatus({
        sessionToken,
        repId: rep._id as Id<"agcRepresentatives">,
        status: rep.status === "disabled" ? "active" : "disabled",
      });
      toast.success(
        rep.status === "disabled"
          ? `Enabled ${rep.username}`
          : `Disabled ${rep.username} — sign-ins are blocked`,
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to update rep"));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!sessionToken || busy) return;
    setBusy(true);
    try {
      const result = await issueTempPassword({
        sessionToken,
        repId: rep._id as Id<"agcRepresentatives">,
        clientOrigin: window.location.origin,
      });
      onCredentials(`${result.username}: ${result.tempPassword}`);
      toast.success(
        result.tempPassword
          ? `New temporary password issued for ${result.username}`
          : `Credentials resent for ${result.username}`,
      );
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Failed to reset password"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void toggleStatus()}
      >
        <PowerOff className="size-3.5" />
        {rep.status === "disabled" ? "Enable account" : "Disable account"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void resetPassword()}
      >
        <KeyRound className="size-3.5" />
        Reset password
      </Button>
    </div>
  );
}

/** Expanded detail: mini stat tiles + rep contact card. */
function HubDetail({
  hub,
  onCredentials,
}: {
  hub: HubRow;
  onCredentials: (v: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Registrations
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <StatTile size="sm" label="Delegates" value={hub.registrations.delegates} />
          <StatTile size="sm" tone="positive" label="Confirmed" value={hub.registrations.confirmed} />
          <StatTile size="sm" tone="warning" label="Awaiting review" value={hub.registrations.pending} />
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Accommodation
        </p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <StatTile size="sm" label="Bookings" value={hub.bookings.total} />
          <StatTile size="sm" tone="positive" label="Confirmed" value={hub.bookings.confirmed} />
          <StatTile size="sm" tone="warning" label="Awaiting review" value={hub.bookings.pending} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <HubAvatar hubName={hub.hubName} large />
        {hub.rep ? (
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{hub.rep.username}</span>
              <RepStatusBadge status={hub.rep.status} />
              {!hub.rep.profileComplete && (
                <Badge variant="outline" className="text-[10px]">setup incomplete</Badge>
              )}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="size-3" />
              {hub.rep.email ?? "no email on file"}
            </p>
            <RepActions rep={hub.rep} onCredentials={onCredentials} />
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <UserX className="size-4" />
            No rep account yet — create one in the AGC console.
          </p>
        )}
      </div>
    </div>
  );
}
export function HubsRepsManager() {
  const { sessionToken } = useAdminSession();
  // Credential banner (shown after RepActions issues a temp password).
  const [credentials, setCredentials] = useState<string | null>(null);
  const roster = useQuery(
    api.agcAdminData.getHubRoster,
    sessionToken ? { sessionToken } : "skip",
  ) as HubRow[] | undefined;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HubFilterId>("all");
  const [sort, setSort] = useState<HubSortId>("name");
  const [expanded, setExpanded] = useState<string | null>(null);

  const summary = useMemo(
    () => hubRosterSummary(roster ?? []),
    [roster],
  );

  const rows = useMemo(() => {
    const list = (roster ?? []).filter(
      (hub) =>
        matchesHubFilter(filter, hub) && hubMatchesSearch(hub, search),
    );
    return sortHubRows(sort, list);
  }, [roster, filter, search, sort]);

  if (!sessionToken) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (roster === undefined) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary tiles — click one to jump the list to that view. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" className="text-left" onClick={() => setFilter("all")}>
          <StatTile
            label="Total hubs"
            value={summary.hubs}
            hint={summary.pendingSetup + " pending setup"}
          />
        </button>
        <button type="button" className="text-left" onClick={() => setFilter("active")}>
          <StatTile
            label="Active reps"
            value={summary.activeReps}
            tone="positive"
            hint="can sign in and book"
          />
        </button>
        <button type="button" className="text-left" onClick={() => setFilter("all")}>
          <StatTile
            label="Delegates registered"
            value={summary.delegates}
            tone="info"
            hint={summary.confirmedDelegates + " confirmed"}
          />
        </button>
        <button type="button" className="text-left" onClick={() => setFilter("attention")}>
          <StatTile
            label="Needs attention"
            value={summary.attention}
            tone={summary.attention > 0 ? "warning" : "positive"}
            hint="receipts or holds waiting"
          />
        </button>      </div>

      {credentials && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-mono text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          New credentials: {credentials} — copy now, shown once.
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Hubs &amp; representatives</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Hub, username or email…"
                  className="h-9 w-56 pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={sort} onValueChange={(v) => setSort((v ?? "name") as HubSortId)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HUB_SORTS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Sort: {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {HUB_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === f.id
                    ? "border-gold bg-gold/15 text-ink"
                    : "text-muted-foreground hover:border-gold/40 hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-gold/15">
                <InboxIcon className="size-5 text-gold-dark" />
              </span>
              <p className="text-sm font-medium">No hubs match</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {search || filter !== "all"
                  ? "Try a different search or filter chip."
                  : "Hubs appear here once imported in the AGC console."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="space-y-2 xl:hidden">
                {rows.map((hub) => (
                  <li key={hub._id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === hub._id ? null : hub._id)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors hover:border-gold/40",
                        hub.needsAttention && "border-l-4 border-l-amber-400",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <HubAvatar hubName={hub.hubName} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                            {hub.needsAttention && (
                              <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                            )}
                            {hub.hubName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {hub.rep ? hub.rep.username + " · " + (hub.rep.email ?? "no email") : "no rep account"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{hub.registrations.delegates}</p>
                          <p className="text-[10px] text-muted-foreground">delegates</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {hub.rep && <RepStatusBadge status={hub.rep.status} />}
                        <QuietBadge hub={hub} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8" />
                      <TableHead>Hub</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Representative</TableHead>
                      <TableHead className="text-right">Delegates</TableHead>
                      <TableHead className="text-right">Registrations</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead className="text-right">Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((hub) => (
                      <Fragment key={hub._id}>
                        <TableRow
                          className={cn(
                            "cursor-pointer",
                            hub.needsAttention && "border-l-4 border-l-amber-400",
                          )}
                          onClick={() =>
                            setExpanded(expanded === hub._id ? null : hub._id)
                          }
                        >
                          <TableCell>
                            {expanded === hub._id ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2.5">
                              <HubAvatar hubName={hub.hubName} />
                              <span className="flex items-center gap-1.5 font-medium">
                                {hub.needsAttention && (
                                  <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                                )}
                                {hub.hubName}
                                {!hub.active && (
                                  <Badge variant="outline" className="text-[10px]">inactive</Badge>
                                )}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-sm capitalize text-muted-foreground">
                            {hub.region.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            {hub.rep ? (
                              <span className="flex flex-col gap-0.5">
                                <RepStatusBadge status={hub.rep.status} />
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="size-3" />
                                  {hub.rep.email ?? "no email"}
                                </span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <UserX className="size-3.5" />
                                no rep account
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <StatCell
                              value={hub.registrations.delegates}
                              pending={0}
                              pendingLabel=""
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <StatCell
                              value={hub.registrations.confirmed}
                              pending={hub.registrations.pending}
                              pendingLabel="awaiting"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <StatCell
                              value={hub.bookings.confirmed}
                              pending={hub.bookings.pending}
                              pendingLabel="awaiting"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <QuietBadge hub={hub} />
                          </TableCell>
                        </TableRow>
                        {expanded === hub._id && (
                          <TableRow>
                            <TableCell colSpan={8} className="p-2">
                              <HubDetail hub={hub} onCredentials={setCredentials} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}