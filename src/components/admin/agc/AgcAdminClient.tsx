"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { paymentStatusMeta } from "@/lib/agcPortal";

type AdminRegistrationRow = {
  _id: string;
  referenceNumber: string;
  hubName: string;
  region: string;
  quantity: number;
  currency: string;
  totalAmount: number;
  paymentMode: string;
  paymentStatus: string;
  adminMessage: string | null;
  offline: {
    amountPaid: number;
    referenceNumber: string;
    paymentDate: string;
    method: string;
    receiptFileName?: string;
  } | null;
  receiptUrl: string | null;
};

export type ReviewDecision =
  | "approve"
  | "reject"
  | "request_correction";

export function ReviewActions({
  onDecision,
  disabled,
}: {
  onDecision: (decision: ReviewDecision, message?: string) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  return (
    <div className="mt-3 space-y-2">
      <Textarea
        rows={2}
        placeholder="Optional message to the representative (required for correction requests)"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onDecision("approve", message || undefined)}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !message.trim()}
          onClick={() => onDecision("request_correction", message)}
          className="border-orange-400 text-orange-700 hover:bg-orange-50"
        >
          Request correction
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={disabled}
          onClick={() => onDecision("reject", message || undefined)}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

/** Registration review queue for the Registrations admin page. */
export default function RegistrationsTab() {
  const { sessionToken } = useAdminSession();
  const rows = useQuery(
    api.agcAdminData.listAgcRegistrationsAdmin,
    sessionToken ? { sessionToken } : "skip",
  );
  const review = useMutation(api.agcAdminData.reviewAgcRegistration);
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (
    row: AdminRegistrationRow,
    decision: ReviewDecision,
    message?: string,
  ) => {
    if (!sessionToken) return;
    setBusyId(row._id);
    try {
      await review({
        sessionToken,
        registrationId: row._id as Id<"agcRegistrations">,
        decision,
        message,
      });
      toast.success(`Registration ${decision.replace(/_/g, " ")}d`);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Review failed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {(rows ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
          No registrations yet.
        </p>
      )}
      {(rows ?? []).map((row: AdminRegistrationRow) => {
        const status = paymentStatusMeta(row.paymentStatus);
        return (
          <Card key={row._id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="font-mono text-sm">
                  {row.referenceNumber || "(pending)"}
                </CardTitle>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </div>
              <CardDescription>
                {row.hubName} · {row.quantity} delegate(s) · {row.currency}{" "}
                {row.totalAmount} · {row.paymentMode}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {row.offline && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p>
                    Amount paid:{" "}
                    <strong>
                      {row.currency} {row.offline.amountPaid}
                    </strong>{" "}
                    · {row.offline.method.replace(/_/g, " ")} ·{" "}
                    {row.offline.paymentDate}
                  </p>
                  <p className="text-muted-foreground">
                    Txn ref: {row.offline.referenceNumber}
                  </p>
                  {row.receiptUrl && (
                    <a
                      href={row.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-primary hover:underline"
                    >
                      View receipt ({row.offline.receiptFileName})
                    </a>
                  )}
                </div>
              )}
              {row.adminMessage && (
                <p className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-900 dark:bg-orange-950 dark:text-orange-300">
                  Last message: {row.adminMessage}
                </p>
              )}
              {/* Decided rows show as confirmed cards — actions only while
                  a payment is awaiting review. */}
              {row.paymentStatus === "pending_verification" && (
                <ReviewActions
                  disabled={busyId === row._id}
                  onDecision={(decision, message) =>
                    void decide(row, decision, message)
                  }
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Trigger a browser download from a Convex action's base64 payload. */
export function downloadBase64(
  filename: string,
  contentBase64: string,
): void {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type AgcExportKind = "bookings" | "registrations";

/** Shared export-button wiring for the Registrations and Accommodation pages. */
export function AgcExcelExportButton({
  which,
  label,
}: {
  which: AgcExportKind;
  label: string;
}) {
  const { sessionToken } = useAdminSession();
  const exportBookingsAction = useAction(api.agcExcel.exportBookingsExcel);
  const exportRegistrationsAction = useAction(
    api.agcExcel.exportRegistrationsExcel,
  );
  const [exporting, setExporting] = useState(false);

  const runExport = async () => {
    if (!sessionToken) return;
    setExporting(true);
    try {
      const result =
        which === "bookings"
          ? await exportBookingsAction({ sessionToken })
          : await exportRegistrationsAction({ sessionToken });
      downloadBase64(result.filename, result.contentBase64);
    } catch (err) {
      toast.error(...toastFriendlyErrorParts(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={exporting}
      onClick={() => void runExport()}
    >
      {exporting ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <DownloadIcon className="size-4" />
      )}
      {label}
    </Button>
  );
}
