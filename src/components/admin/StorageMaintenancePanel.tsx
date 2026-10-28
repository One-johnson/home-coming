"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDay(at: number | null): string {
  if (!at) return "—";
  return new Date(at).toLocaleDateString();
}

/**
 * Admin-only housekeeping for Convex file storage.
 *
 * Receipts, POA evidence and Excel workbooks are uploaded before the record
 * that claims them exists, so a rejected submit leaves the file behind with
 * nothing pointing at it. This panel reports how much of that has piled up and
 * clears it — with a grace window so uploads still in flight are never touched.
 */
export function StorageMaintenancePanel() {
  const { user } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const isAdmin = user?.role === "admin";
  const report = useQuery(
    api.storageMaintenance.getStorageReport,
    isAdmin ? sessionArgs : "skip",
  );
  const sweep = useMutation(api.storageMaintenance.sweepOrphanedFiles);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{
    deleted: number;
    bytesFreed: number;
    remaining: number;
  } | null>(null);
  const ready = sessionArgs !== "skip";

  if (!isAdmin) return null;

  const handleSweep = async () => {
    if (sessionArgs === "skip") return;
    setRunning(true);
    try {
      const result = await sweep({ ...sessionArgs });
      setLastRun(result);
      if (result.deleted === 0) {
        toast.success("No orphaned files to remove");
      } else {
        toast.success(
          `Removed ${result.deleted} orphaned file${result.deleted === 1 ? "" : "s"} · ${formatBytes(result.bytesFreed)} freed`,
        );
      }
      setConfirming(false);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Cleanup failed");
    } finally {
      setRunning(false);
    }
  };

  const orphaned = report?.orphanedFiles ?? 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="text-sm font-medium">File storage</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Receipts, payment evidence and imported workbooks. Files that no
              record points at were left behind by a failed submission and can
              be removed.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={
              running || !ready || report === undefined || orphaned === 0
            }
            onClick={() => setConfirming(true)}
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {running ? "Cleaning…" : "Remove orphaned files"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {report === undefined ? (
            <p className="text-xs text-muted-foreground">Measuring storage…</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    Total in storage
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatBytes(report.totalBytes)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {report.fileCount} file{report.fileCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">Orphaned</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatBytes(report.orphanedBytes)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {report.orphanedFiles} file
                    {report.orphanedFiles === 1 ? "" : "s"} unreferenced
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    Oldest orphan
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatDay(report.oldestOrphanAt)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Files under {report.graceHours}h old are kept
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Payment receipts and POA evidence delete on their own{" "}
                <span className="font-medium text-foreground">
                  {report.retentionDays} days
                </span>{" "}
                after finance confirms the payment. {report.awaitingExpiry} image
                {report.awaitingExpiry === 1 ? " is" : "s are"} waiting
                {report.nextExpiryAt
                  ? `, the next on ${formatDay(report.nextExpiryAt)}`
                  : ""}
                .
              </p>
              {report.sample.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">
                    Show the {report.sample.length} oldest
                  </summary>
                  <ul className="mt-2 space-y-1 font-mono text-[11px]">
                    {report.sample.map((file) => (
                      <li key={file.id} className="flex justify-between gap-3">
                        <span className="truncate">{file.id}</span>
                        <span className="tabular-nums">
                          {formatBytes(file.size)} ·{" "}
                          {new Date(file.createdAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {lastRun && (
                <p className="text-xs text-muted-foreground">
                  Last cleanup removed {lastRun.deleted} file
                  {lastRun.deleted === 1 ? "" : "s"} ({formatBytes(lastRun.bytesFreed)})
                  {lastRun.remaining > 0
                    ? ` · ${lastRun.remaining} still orphaned, run again to clear the rest`
                    : ""}
                  .
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${orphaned} orphaned file${orphaned === 1 ? "" : "s"}?`}
        description={`${formatBytes(report?.orphanedBytes ?? 0)} of uploads that no registration, booking, payment record or content row points at will be permanently deleted. Files uploaded in the last ${report?.graceHours ?? 24} hours are left alone.`}
        confirmLabel={`Remove ${orphaned}`}
        loading={running}
        onConfirm={handleSweep}
      />
    </>
  );
}
