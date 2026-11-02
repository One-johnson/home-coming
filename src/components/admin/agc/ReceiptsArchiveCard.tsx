"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { downloadBase64File } from "@/lib/downloadFile";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";

type ReceiptFilter = "all" | "paid" | "poa";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Receipts archive: download every paid receipt and POA receipt into one Excel
 * workbook (or one side at a time), and delete whole sets of receipt files
 * when they are no longer needed. The payments themselves are never touched —
 * only the uploaded proof images/PDFs.
 */
export function ReceiptsArchiveCard({
  sessionToken,
}: {
  sessionToken: string | null;
}) {
  const stats = useQuery(
    api.agcReceipts.getReceiptStats,
    sessionToken ? { sessionToken } : "skip",
  );
  const exportReceipts = useAction(api.agcReceiptsExcel.exportReceiptsExcel);
  const purgeReceipts = useMutation(api.agcReceipts.purgeReceipts);

  const [exporting, setExporting] = useState<ReceiptFilter | null>(null);
  const [confirming, setConfirming] = useState<"paid" | "poa" | null>(null);
  const [purging, setPurging] = useState(false);

  const paidCount = stats?.paid.count ?? 0;
  const poaCount = stats?.poa.count ?? 0;
  const totalCount = paidCount + poaCount;

  const handleExport = async (filter: ReceiptFilter) => {
    if (!sessionToken || exporting) return;
    setExporting(filter);
    try {
      const result = await exportReceipts({ sessionToken, filter });
      downloadBase64File(result.filename, result.contentBase64);
      toast.success(
        result.rows === 0
          ? "No receipts on file yet — downloaded an empty workbook"
          : `Downloaded ${result.rows} receipt${result.rows === 1 ? "" : "s"} to Excel`,
      );
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Could not build the receipt workbook"),
      );
    } finally {
      setExporting(null);
    }
  };

  const handlePurge = async () => {
    if (!sessionToken || !confirming) return;
    setPurging(true);
    try {
      // Each call deletes one bounded batch; repeat until the set is empty so
      // a large archive never overruns a single mutation's transaction.
      let deleted = 0;
      let bytesFreed = 0;
      let remaining = 0;
      for (let pass = 0; pass < 40; pass += 1) {
        const result = await purgeReceipts({
          sessionToken,
          filter: confirming,
        });
        deleted += result.deleted;
        bytesFreed += result.bytesFreed;
        remaining = result.remaining;
        if (remaining === 0) break;
      }
      if (deleted === 0) {
        toast.success("Nothing to delete — no receipt files on file");
      } else {
        toast.success(
          `Deleted ${deleted} receipt file${deleted === 1 ? "" : "s"} · ${formatBytes(bytesFreed)} freed${
            remaining > 0
              ? ` · ${remaining} still on file, press delete again to finish`
              : ""
          }`,
        );
      }
      setConfirming(null);
    } catch (err) {
      toast.error(
        ...toastFriendlyErrorParts(err, "Could not delete receipt files"),
      );
    } finally {
      setPurging(false);
    }
  };

  const exportButton = (
    filter: ReceiptFilter,
    label: string,
    count: number,
    primary = false,
  ) => (
    <Button
      key={filter}
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      disabled={!sessionToken || exporting !== null}
      onClick={() => void handleExport(filter)}
    >
      {exporting === filter ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {label} ({count})
    </Button>
  );

  const confirmPaid = confirming === "paid";
  const confirmCount = confirmPaid ? paidCount : poaCount;
  const confirmBytes = confirmPaid
    ? (stats?.paid.bytes ?? 0)
    : (stats?.poa.bytes ?? 0);
  const awaiting = stats?.poa.awaitingConfirmation ?? 0;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Receipts archive</CardTitle>
          <CardDescription>
            Every payment receipt the portal holds — paid receipts on confirmed
            payments and POA receipts on pay-on-arrival records — in one
            spreadsheet, with each row linking to the uploaded file. Amounts
            stay in their own currency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Paid receipts</p>
              <p className="text-lg font-semibold tabular-nums">
                {stats === undefined ? "…" : paidCount}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {stats === undefined ? "Counting…" : formatBytes(stats.paid.bytes)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">POA receipts</p>
              <p className="text-lg font-semibold tabular-nums">
                {stats === undefined ? "…" : poaCount}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {stats === undefined ? "Counting…" : formatBytes(stats.poa.bytes)}
                {stats !== undefined && awaiting > 0
                  ? ` · ${awaiting} awaiting confirmation`
                  : ""}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Download to Excel</p>
            <div className="flex flex-wrap gap-2">
              {exportButton("all", "All receipts", totalCount, true)}
              {exportButton("paid", "Paid only", paidCount)}
              {exportButton("poa", "POA only", poaCount)}
            </div>
            <p className="text-[11px] text-muted-foreground">
              &ldquo;All receipts&rdquo; puts paid and POA receipts on separate
              sheets of one workbook, each with a total per currency.
            </p>
          </div>

          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium text-destructive">
              Delete receipt files
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!sessionToken || purging || paidCount === 0}
                onClick={() => setConfirming("paid")}
              >
                <Trash2 className="size-4" />
                Delete paid receipts
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!sessionToken || purging || poaCount === 0}
                onClick={() => setConfirming("poa")}
              >
                <Trash2 className="size-4" />
                Delete POA receipts
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Removes the uploaded receipt images and PDFs from file storage and
              from their records. The payments, amounts, currencies and
              confirmations stay exactly as they are. This cannot be undone.
            </p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={`Delete ${confirmCount} ${confirmPaid ? "paid" : "POA"} receipt${confirmCount === 1 ? "" : "s"}?`}
        description={
          confirmPaid
            ? `${formatBytes(confirmBytes)} of receipt images and PDFs attached to confirmed payments will be permanently deleted. The payments themselves stay confirmed — only the uploaded files go.`
            : `${formatBytes(confirmBytes)} of POA payment evidence will be permanently deleted.${
                awaiting > 0
                  ? ` ${awaiting} of these ${awaiting === 1 ? "is" : "are"} still awaiting confirmation.`
                  : ""
              } The payments themselves are unchanged — only the uploaded files go.`
        }
        confirmLabel={`Delete ${confirmCount}`}
        loading={purging}
        onConfirm={handlePurge}
      />
    </>
  );
}