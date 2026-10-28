"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, type StaffRole } from "@/lib/adminRoles";

/**
 * Delegate corrections — the audit area's view of the name and gender changes
 * made on locked reservations.
 *
 * A rep can only substitute while a booking is still theirs to change, so once a
 * reservation is confirmed a correction happens in the console: at the desk, in
 * the review queue or on the bookings list. This panel is where a super admin
 * sees that set — who changed what, what the old details were, and the reason
 * they gave — without reading the raw audit log line by line.
 *
 * A rep's own substitution while the booking was still open is recorded on the
 * booking and is deliberately not listed: it needed no review to begin with.
 */

type ActorOption = {
  email: string;
  count: number;
  role: string | null;
};

type TeamOption = {
  role: string;
  count: number;
};

type CorrectionRow = {
  _id: string;
  createdAt: number;
  previousFirstName: string;
  previousLastName: string;
  previousGender: string;
  newFirstName: string;
  newLastName: string;
  newGender: string;
  reason: string | null;
  actorEmail: string;
  actorRole: string | null;
  bookingRef: string | null;
};

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: string | null): string {
  if (!role) return "account removed";
  return ROLE_LABELS[role as StaffRole] ?? role;
}

/** Start of the picked day in the viewer's own timezone, or undefined. */
function startOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const at = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(at) ? undefined : at;
}

/** End of the picked day — a range is inclusive of both dates it names. */
function endOfDay(value: string): number | undefined {
  if (!value) return undefined;
  const at = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isNaN(at) ? undefined : at;
}

export function DelegateCorrectionsPanel() {
  const { user } = useAdminSession();
  // The audit area also admits finance, who hold a read-only financial view, so
  // the panel stays with the super admin the query answers to.
  const isSuperAdmin = user?.role === "admin";

  // Which team changed it, which person in that team, and when it happened.
  // All three go to the server: the list is capped, so filtering the loaded page
  // would hide older corrections that match.
  const [actorRole, setActorRole] = useState<string>("");
  const [actorEmail, setActorEmail] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const filtersActive =
    actorRole !== "" || actorEmail !== "" || fromDate !== "" || toDate !== "";

  const filters = useMemo(
    () => ({
      actorRole: actorRole || undefined,
      actorEmail: actorEmail || undefined,
      from: startOfDay(fromDate),
      to: endOfDay(toDate),
    }),
    [actorRole, actorEmail, fromDate, toDate],
  );
  const sessionArgs = useSessionArgs(filters);
  const corrections = useQuery(
    api.admin.listDelegateCorrections,
    isSuperAdmin ? sessionArgs : "skip",
  );

  const teams = (corrections?.teams ?? []) as TeamOption[];
  const actors = (corrections?.actors ?? []) as ActorOption[];
  const rows = (corrections?.rows ?? []) as CorrectionRow[];
  // The person list follows the team, so the two filters cannot contradict each
  // other: pick a team and the people offered are the ones on it.
  const visibleActors = actorRole
    ? actors.filter((actor) => actor.role === actorRole)
    : actors;

  if (!isSuperAdmin) return null;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-start gap-2 border-b px-4 py-3">
          <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Delegate corrections
              {corrections !== undefined && rows.length > 0 && (
                <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {filtersActive
                    ? `${rows.length} of ${corrections.total}`
                    : rows.length}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Names and genders changed on a confirmed reservation by an admin or
              the Accommodation Admin, with the details each change replaced and
              the reason given. A rep&apos;s own substitution, made while the
              booking was still open, is recorded on the booking and not listed
              here.
            </p>
          </div>
        </div>

        {/* Filters sit under the description: who made the change, and over
            which days. */}
        <div className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="corrections-team" className="text-xs">
              Team
            </Label>
            <Select
              value={actorRole || "all"}
              onValueChange={(value) => {
                const next = !value || value === "all" ? "" : value;
                setActorRole(next);
                // Dropping a person who is not on the team just picked keeps the
                // two filters from silently contradicting each other.
                setActorEmail((current) => {
                  if (!next || !current) return current;
                  const person = actors.find((actor) => actor.email === current);
                  return person && person.role === next ? current : "";
                });
              }}
            >
              <SelectTrigger id="corrections-team" className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any team</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.role} value={team.role}>
                    {roleLabel(team.role)} ({team.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="corrections-actor" className="text-xs">
              Changed by
            </Label>
            <Select
              value={actorEmail || "all"}
              onValueChange={(value) =>
                setActorEmail(!value || value === "all" ? "" : value)
              }
            >
              <SelectTrigger
                id="corrections-actor"
                className="h-8 w-64 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {visibleActors.map((actor) => (
                  <SelectItem key={actor.email} value={actor.email}>
                    {actor.email} · {roleLabel(actor.role)} ({actor.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="corrections-from" className="text-xs">
              From
            </Label>
            <Input
              id="corrections-from"
              type="date"
              className="h-8 w-36 text-xs"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="corrections-to" className="text-xs">
              To
            </Label>
            <Input
              id="corrections-to"
              type="date"
              className="h-8 w-36 text-xs"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          {filtersActive && (
            <Button
              type="button"
              variant="link"
              className="h-8 px-1 text-xs font-medium"
              onClick={() => {
                setActorRole("");
                setActorEmail("");
                setFromDate("");
                setToDate("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {corrections === undefined ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Changed by</TableHead>
                  <TableHead>Was</TableHead>
                  <TableHead>Now</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {filtersActive
                        ? `No correction matches these filters${corrections.total > 0 ? ` — clear them to see all ${corrections.total}` : ""}.`
                        : "No delegate has been corrected from the console yet — a name or gender changed at the desk, in the review queue or on a booking appears here with its reason."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row._id}>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {row.actorEmail}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {roleLabel(row.actorRole)}
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {`${row.previousFirstName} ${row.previousLastName}`}
                        <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                          {row.previousGender}
                        </span>
                      </TableCell>
                      <TableCell className="align-top text-sm font-medium">
                        {`${row.newFirstName} ${row.newLastName}`}
                        <span className="mt-0.5 block text-xs font-normal capitalize text-muted-foreground">
                          {row.newGender}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal align-top text-sm">
                        {row.reason ?? "—"}
                        {row.bookingRef && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Booking ref {row.bookingRef}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
