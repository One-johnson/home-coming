"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { Download, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
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

/**
 * Phase 2 §24 operational exports. Every report flies through the same
 * filter set (accommodation type, building, gender) — the offline/reporting
 * surfaces stay consistent.
 */

const REPORTS: Array<{ kind: string; label: string }> = [
  { kind: "room_assignments", label: "Room assignment report" },
  { kind: "unassigned_delegates", label: "Unassigned delegates report" },
  { kind: "occupancy", label: "Accommodation occupancy report" },
  { kind: "checked_in", label: "Checked-in delegates report" },
  { kind: "not_arrived", label: "Not-arrived delegates report" },
  { kind: "check_out", label: "Check-out report" },
  { kind: "key_issuance", label: "Key issuance report" },
  { kind: "key_replacement", label: "Key replacement report" },
  { kind: "room_changes", label: "Room change history" },
  { kind: "payment_overrides", label: "Payment override report" },
  { kind: "offline_sync", label: "Offline sync exceptions" },
  { kind: "check_in_activity", label: "Check-in activity report" },
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

  return (
    <div className="space-y-4">
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
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map(({ kind, label }) => (
          <Card key={kind}>
            <CardContent className="flex items-center justify-between gap-2 p-3">
              <p className="text-sm">{label}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={busyKind !== null}
                onClick={() => void exportReport(kind)}
              >
                {busyKind === kind ? (
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
      <p className="text-xs text-muted-foreground">
        PDF: every admin list also prints cleanly through the browser (Ctrl/Cmd+P →
        Save as PDF) from the live pages and dialogs; the .xlsx files above are the
        machine-readable copies for finance and operations.
      </p>
    </div>
  );
}
