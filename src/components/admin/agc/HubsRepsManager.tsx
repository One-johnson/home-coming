"use client";

import { useQuery } from "convex/react";
import { Fragment, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Mail,
  UserX,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type HubRow = {
  _id: string;
  hubName: string;
  region: string;
  country: string;
  active: boolean;
  rep: {
    _id: string;
    username: string;
    email: string | null;
    status: string;
    profileComplete: boolean;
  } | null;
  registrations: {
    total: number;
    confirmed: number;
    pending: number;
    delegates: number;
    lastActivityAt: number;
  };
  bookings: {
    total: number;
    confirmed: number;
    pending: number;
    lastActivityAt: number;
  };
  needsAttention: boolean;
  inactiveDays: number;
};

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

function HubDetail({ hub }: { hub: HubRow }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Registrations
        </p>
        <p className="mt-1 text-sm">
          {hub.registrations.delegates} delegates across{" "}
          {hub.registrations.total} submission
          {hub.registrations.total === 1 ? "" : "s"} ·{" "}
          {hub.registrations.confirmed} confirmed
          {hub.registrations.pending > 0 && (
            <span className="text-amber-700">
              {" "}
              · {hub.registrations.pending} awaiting review
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Last activity:{" "}
          {hub.registrations.lastActivityAt
            ? new Date(hub.registrations.lastActivityAt).toLocaleString()
            : "none"}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Accommodation
        </p>
        <p className="mt-1 text-sm">
          {hub.bookings.confirmed} confirmed of {hub.bookings.total} booking
          {hub.bookings.total === 1 ? "" : "s"}
          {hub.bookings.pending > 0 && (
            <span className="text-amber-700">
              {" "}
              · {hub.bookings.pending} awaiting review
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Last activity:{" "}
          {hub.bookings.lastActivityAt
            ? new Date(hub.bookings.lastActivityAt).toLocaleString()
            : "none"}
        </p>
      </div>
      <div className="sm:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Representative
        </p>
        <p className="mt-1 text-sm">
          {hub.rep ? (
            <>
              <span className="font-mono text-xs">{hub.rep.username}</span> ·{" "}
              {hub.rep.email ?? "no email"} ·{" "}
              {hub.rep.profileComplete
                ? "profile complete"
                : "first-time setup not finished"}
            </>
          ) : (
            "No rep account yet — create one in the AGC console."
          )}
        </p>
      </div>
    </div>
  );
}

export function HubsRepsManager() {
  const { sessionToken } = useAdminSession();
  const roster = useQuery(
    api.agcAdminData.getHubRoster,
    sessionToken ? { sessionToken } : "skip",
  ) as HubRow[] | undefined;
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!sessionToken) {
    return (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }

  if (roster === undefined) {
    return (
      <p className="text-sm text-muted-foreground">Loading hubs…</p>
    );
  }

  const q = filter.trim().toLowerCase();
  const rows = q
    ? roster.filter(
        (row) =>
          row.hubName.toLowerCase().includes(q) ||
          (row.rep?.username ?? "").includes(q) ||
          (row.rep?.email ?? "").toLowerCase().includes(q),
      )
    : roster;

  const attentionCount = roster.filter((row) => row.needsAttention).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Hubs &amp; representatives</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {roster.length} hubs · {attentionCount} need attention. Click a
              row for registration and booking detail.
            </p>
          </div>
          <Input
            type="search"
            placeholder="Filter by hub, username or email…"
            className="h-10 max-w-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {q ? "No hubs match your filter." : "No hubs yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Hub</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Representative</TableHead>
                  <TableHead className="text-right">Delegates</TableHead>
                  <TableHead className="text-right">Regs (conf/pend)</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Quiet for</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((hub) => (
                  <Fragment key={hub._id}>
                    <TableRow
                      className="cursor-pointer"
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
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {hub.needsAttention && (
                            <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                          )}
                          {hub.hubName}
                          {!hub.active && (
                            <Badge variant="outline" className="text-[10px]">
                              inactive
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="capitalize">
                        {hub.region.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        {hub.rep ? (
                          <span className="flex flex-col">
                            <span className="flex items-center gap-1.5">
                              <RepStatusBadge status={hub.rep.status} />
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
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
                      <TableCell className="text-right tabular-nums">
                        {hub.registrations.delegates}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hub.registrations.confirmed}/{hub.registrations.pending}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hub.bookings.confirmed}/{hub.bookings.pending}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {hub.registrations.lastActivityAt === 0 &&
                        hub.bookings.lastActivityAt === 0
                          ? "—"
                          : hub.inactiveDays === 0
                            ? "today"
                            : `${hub.inactiveDays}d`}
                      </TableCell>
                    </TableRow>
                    {expanded === hub._id && (
                      <TableRow>
                        <TableCell colSpan={8} className="p-2">
                          <HubDetail hub={hub} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
