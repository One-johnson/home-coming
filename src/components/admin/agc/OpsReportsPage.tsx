"use client";

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
import { TONE_BADGE, TONE_RAIL, TONE_SURFACE, TONE_TEXT, type StatusTone } from "@/lib/agcStatusTone";
import { StatusLegend } from "@/components/admin/agc/StatusPrimitives";
import { cn } from "@/lib/utils";

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
    hint: "Run these while rooms are still being prepared; the pre-arrival checklist links here.",
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
    hint: "Work down the list in order; the runbook closes the day this way.",
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
            <span>
              Filters apply to every export below. Excel is the machine-readable copy;
              Ctrl/Cmd+P → Save as PDF prints a clean copy of any live screen.
            </span>
          </div>
          <StatusLegend tones={["info", "done", "blocked"]} />
        </CardContent>
      </Card>

      {GROUPS.map((group) => {
        const GroupIcon = group.icon;
        return (
          <section key={group.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-lg border",
                  TONE_BADGE[group.tone],
                )}
              >
                <GroupIcon className="size-4" />
              </span>
              <h2 className="text-sm font-semibold">{group.title}</h2>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {group.reports.length} report(s)
              </Badge>
              <p className="text-[11px] text-muted-foreground">{group.hint}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.reports.map((report, index) => (
                <Card
                  key={report.kind}
                  className={cn("border-l-4", TONE_RAIL[group.tone])}
                >
                  <CardContent className="flex items-start justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="flex items-start gap-1.5 text-sm font-medium">
                        {group.ordered ? (
                          <span
                            className={cn(
                              "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                              TONE_SURFACE[group.tone],
                              TONE_TEXT[group.tone],
                              "border",
                            )}
                          >
                            {index + 1}
                          </span>
                        ) : null}
                        <span>{report.label}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      <div
        className={cn(
          "rounded-xl border border-l-4 p-3 text-xs text-muted-foreground",
          TONE_SURFACE.info,
          TONE_RAIL.info,
        )}
      >
        <p className="mb-1 font-medium text-foreground">Close-out order</p>
        <p>
          Room assignment → Unassigned delegates → Occupancy → Checked-in / Not-arrived /
          Check-out → Key issuance &amp; replacement → Room changes, Overrides and Offline
          sync exceptions. The last group must be empty before the desk closes; every
          override and room move is reviewed by the Accommodation Admin.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
          <a
            className="inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium hover:bg-muted"
            href="/admin/desk-checkin"
          >
            Desk check-in ↗
          </a>
          <a
            className="inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium hover:bg-muted"
            href="/admin/arrival"
          >
            Arrival desk ↗
          </a>
          <a
            className="inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium hover:bg-muted"
            href="/admin/help"
          >
            Runbook ↗
          </a>
        </div>
      </div>
    </div>
  );
}
