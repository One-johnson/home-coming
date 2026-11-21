"use client";

import Link from "next/link";

import { useState } from "react";
import { useAction } from "convex/react";
import {
  BedDouble,
  ClipboardCheck,
  Download,
  Loader2Icon,
  Printer,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
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
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { AGC_ACCOMMODATION_LABELS } from "@/lib/agcPortal";
import type { StatusTone } from "@/lib/agcStatusTone";
import { StatusLegend } from "@/components/admin/agc/StatusPrimitives";

/**
 * Phase 2 §24 operational exports. Every report flies through the same
 * filter set (accommodation type, building, gender) and sits in the phase of
 * the day it belongs to, so the close-out order doubles as navigation.
 */

type ReportDef = { kind: string; label: string; purpose: string };

type ReportGroup = {
  id: string;
  title: string;
  hint: string;
  tone: StatusTone;
  icon: typeof BedDouble;
  /** Close-out groups are numbered in the order the runbook asks for. */
  ordered?: boolean;
  reports: ReportDef[];
};

const GROUPS: ReportGroup[] = [
  {
    id: "before",
    title: "Before arrival — inventory & rooming",
    hint: "Run these while rooms are still being prepared.",
    tone: "info",
    icon: BedDouble,
    reports: [
      {
        kind: "room_assignments",
        label: "Room assignment report",
        purpose: "Who is in which room, by block and type — the master rooming list.",
      },
      {
        kind: "unassigned_delegates",
        label: "Unassigned delegates report",
        purpose: "Every roomable delegate still without a bed; clear this before the door opens.",
      },
      {
        kind: "occupancy",
        label: "Accommodation occupancy report",
        purpose: "Beds assigned, filled and free per location — spot the blocks about to fill.",
      },
    ],
  },
  {
    id: "door",
    title: "Arrival day — the door",
    hint: "Print these for the desk; refresh them as the queue moves.",
    tone: "done",
    icon: UserCheck,
    reports: [
      {
        kind: "checked_in",
        label: "Checked-in delegates report",
        purpose: "Everyone through the door, with time, desk and who checked them in.",
      },
      {
        kind: "not_arrived",
        label: "Not-arrived delegates report",
        purpose: "The chase list to hand to hub reps — nobody is assumed absent.",
      },
      {
        kind: "check_out",
        label: "Check-out report",
        purpose: "Departures and key/wristband return status.",
      },
      {
        kind: "key_issuance",
        label: "Key issuance report",
        purpose: "Every key handed out, and to whom — reconcile against the key board.",
      },
      {
        kind: "key_replacement",
        label: "Key replacement report",
        purpose: "Keys reissued to a new holder; every replacement is an accountability event.",
      },
    ],
  },
  {
    id: "closeout",
    title: "Close-out — review & reconcile",
    hint: "Work down the list in order to close the day.",
    tone: "blocked",
    icon: ClipboardCheck,
    ordered: true,
    reports: [
      {
        kind: "room_changes",
        label: "Room change history",
        purpose: "Every move with its reason — the Accommodation Admin reviews each one.",
      },
      {
        kind: "payment_overrides",
        label: "Payment override report",
        purpose: "Delegates checked in without confirmed payment, and the written reasons.",
      },
      {
        kind: "offline_sync",
        label: "Offline sync exceptions",
        purpose: "Queued actions that clashed with the central record. Must be zero before close.",
      },
      {
        kind: "check_in_activity",
        label: "Check-in activity report",
        purpose: "Desk activity per station and staff member — reconciles with the conflicts panel.",
      },
    ],
  },
];

const TYPES = ["dormitory", "hostel", "wise_serpents", "good_general", "ebpv"] as const;

export function OpsReportsPage() {
  const { sessionToken } = useAdminSession();
  const runExport = useAction(api.agcOpsExcel.exportOpsReportExcel);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [busyKind, setBusyKind] = useState<string | null>(null);

  const download = (filename: string, contentBase64: string) => {
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
  };

  const exportReport = async (kind: string) => {
    if (!sessionToken) return;
    setBusyKind(kind);
    try {
      const result = await runExport({
        sessionToken,
        report: kind,
        accommodationType: typeFilter === "all" ? undefined : typeFilter,
        building: buildingFilter.trim() || undefined,
        gender: genderFilter === "all" ? undefined : genderFilter,
      });
      download(result.filename, result.contentBase64);
      toast.success("Report downloaded.");
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Export failed"));
    } finally {
      setBusyKind(null);
    }
  };

  const activeFilters = [
    typeFilter !== "all"
      ? AGC_ACCOMMODATION_LABELS[typeFilter as (typeof TYPES)[number]] ?? typeFilter
      : null,
    buildingFilter.trim() ? `block “${buildingFilter.trim()}”` : null,
    genderFilter !== "all" ? genderFilter : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Accommodation type</Label>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value ?? "all")}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {AGC_ACCOMMODATION_LABELS[type] ?? type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Building / block</Label>
              <Input
                placeholder="e.g. Blocks 1–4"
                className="w-44"
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={genderFilter} onValueChange={(value) => setGenderFilter(value ?? "all")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Print this page
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              {activeFilters.length > 0
                ? `Filters: ${activeFilters.join(" · ")}`
                : "No filters — every record"}
            </Badge>
            <span>Filters apply to every export below.</span>
          </div>
          <StatusLegend tones={["info", "done", "blocked"]} />
        </CardContent>
      </Card>

      <div className="admin-stagger grid gap-4 xl:grid-cols-2">
      {GROUPS.map((group) => {
        const GroupIcon = group.icon;
        return (
          <Card key={group.id} className="gap-0 py-0">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="inline-flex size-8 items-center justify-center rounded-xl bg-gold/15 text-gold-dark">
                <GroupIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {group.hint}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {group.reports.length}
              </Badge>
            </div>
            <ul className="divide-y">
              {group.reports.map((report, index) => (
                <li
                  key={report.kind}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                >
                  {group.ordered ? (
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
                      {index + 1}
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{report.label}</p>
                    <p className="truncate text-xs text-muted-foreground" title={report.purpose}>
                      {report.purpose}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={busyKind !== null}
                    onClick={() => void exportReport(report.kind)}
                  >
                    {busyKind === report.kind ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    .xlsx
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      </div>

      <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground shadow-soft">
        <p className="mb-1 font-medium text-foreground">Close-out order</p>
        <p>
          Room assignment → Unassigned delegates → Occupancy → Checked-in / Not-arrived /
          Check-out → Key issuance &amp; replacement → Room changes, Overrides and Offline
          sync exceptions. The last group must be empty before the desk closes; every
          override and room move is reviewed by the Accommodation Admin.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
          <Link
            className="inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-medium transition-colors hover:bg-muted"
            href="/admin/desk-checkin"
          >
            Desk check-in ↗
          </Link>
          <Link
            className="inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-medium transition-colors hover:bg-muted"
            href="/admin/arrival"
          >
            Arrival desk ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
