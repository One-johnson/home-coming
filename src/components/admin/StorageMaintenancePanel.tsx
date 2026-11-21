"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileX2, Loader2, Receipt, UserX } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type TaskId = "orphans" | "receipts" | "reps";

/**
 * Admin-only housekeeping. None of this runs on a timer — an idle deployment
 * should not spend database reads re-scanning tables nobody is changing — so
 * each cleanup is one button, shown with how much it would remove.
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
  const purgeImages = useMutation(api.storageMaintenance.purgeExpiredPaymentImages);
  const purgeReps = useMutation(api.agcAdminData.purgeExpiredDeletedReps);
  const [confirming, setConfirming] = useState<TaskId | null>(null);
  const [running, setRunning] = useState<TaskId | null>(null);

  if (!isAdmin) return null;

  const run = async (task: TaskId) => {
    if (sessionArgs === "skip") return;
    setRunning(task);
    try {
      if (task === "orphans") {
        const r = await sweep({ ...sessionArgs });
        toast.success(
          r.deleted === 0
            ? "No orphaned files to remove"
            : `Removed ${r.deleted} file${r.deleted === 1 ? "" : "s"} · ${formatBytes(r.bytesFreed)} freed${r.remaining > 0 ? ` · ${r.remaining} left, run again` : ""}`,
        );
      } else if (task === "receipts") {
        const r = await purgeImages({ ...sessionArgs });
        toast.success(
          `Deleted ${r.deleted} expired image${r.deleted === 1 ? "" : "s"} · ${formatBytes(r.bytesFreed)} freed`,
        );
      } else {
        const r = await purgeReps({ ...sessionArgs });
        toast.success(`Removed ${r.purged} account${r.purged === 1 ? "" : "s"} permanently`);
      }
      setConfirming(null);
    } catch (err) {
      toast.error(cleanErrorMessage(err) || "Cleanup failed");
    } finally {
      setRunning(null);
    }
  };

  const tasks: Array<{
    id: TaskId;
    icon: typeof FileX2;
    title: string;
    detail: string;
    count: number;
    action: string;
    confirmTitle: string;
    confirmBody: string;
  }> = report
    ? [
        {
          id: "orphans",
          icon: FileX2,
          title: "Orphaned uploads",
          detail: `${formatBytes(report.orphanedBytes)} no record points at · files under ${report.graceHours}h are kept`,
          count: report.orphanedFiles,
          action: "Remove",
          confirmTitle: `Remove ${report.orphanedFiles} orphaned file${report.orphanedFiles === 1 ? "" : "s"}?`,
          confirmBody: `${formatBytes(report.orphanedBytes)} of uploads that no registration, booking, payment or content row points at will be permanently deleted. Files uploaded in the last ${report.graceHours} hours are left alone.`,
        },
        {
          id: "receipts",
          icon: Receipt,
          title: "Expired payment images",
          detail: `Receipts and POA evidence ${report.retentionDays}+ days after confirmation · ${report.awaitingExpiry} still inside the window`,
          count: report.expiredImages,
          action: "Delete",
          confirmTitle: `Delete ${report.expiredImages} expired payment image${report.expiredImages === 1 ? "" : "s"}?`,
          confirmBody: `Receipt photos and POA evidence of payments confirmed more than ${report.retentionDays} days ago are deleted. The records stay; each deletion is written to the audit log.`,
        },
        {
          id: "reps",
          icon: UserX,
          title: "Deleted rep accounts",
          detail: "Soft-deleted more than 7 days ago and no longer restorable",
          count: report.expiredDeletedReps,
          action: "Purge",
          confirmTitle: `Permanently remove ${report.expiredDeletedReps} rep account${report.expiredDeletedReps === 1 ? "" : "s"}?`,
          confirmBody: "These accounts were deleted more than 7 days ago. They are removed for good and cannot be restored.",
        },
      ]
    : [];

  const active = tasks.find((task) => task.id === confirming);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Housekeeping</CardTitle>
          <p className="text-xs text-muted-foreground">
            {report
              ? `${formatBytes(report.totalBytes)} in storage across ${report.fileCount} file${report.fileCount === 1 ? "" : "s"}. Cleanups run only when you press them.`
              : "Measuring storage…"}
          </p>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {tasks.map((task) => {
            const Icon = task.icon;
            const busy = running === task.id;
            return (
              <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {task.title}
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {task.count}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{task.detail}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={running !== null || task.count === 0}
                  onClick={() => setConfirming(task.id)}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {task.action}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={active !== undefined}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={active?.confirmTitle ?? ""}
        description={active?.confirmBody ?? ""}
        confirmLabel={active ? `${active.action} ${active.count}` : ""}
        loading={running !== null}
        onConfirm={() => active && run(active.id)}
      />
    </>
  );
}
