"use client";

import { useRef, useState } from "react";
import { Loader2Icon, PrinterIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { iouReceiptHtml, type IouReceiptDoc } from "@/lib/agcPoa";

/**
 * Shared payment-on-arrival dialogs for the rep portal: the on-demand IOU /
 * paid receipt view (printable) and the payment-evidence upload dialog.
 */

export function PoaIouDialog({
  doc,
  onClose,
}: {
  doc: IouReceiptDoc | null;
  onClose: () => void;
}) {
  const handlePrint = () => {
    if (!doc) return;
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    win.document.write(iouReceiptHtml(doc));
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <Dialog open={!!doc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {doc?.poaStatus === "confirmed" ? "Paid receipt" : "IOU receipt"}
            {doc?.referenceNumber ? ` — ${doc.referenceNumber}` : ""}
          </DialogTitle>
          <DialogDescription>
            {doc?.poaStatus === "confirmed"
              ? "Payment confirmed — this document is your official paid receipt."
              : "Generated on demand from your booking. The total is due on arrival; print it or keep it for your records."}
          </DialogDescription>
        </DialogHeader>
        {doc && (
          <div className="space-y-2 text-sm">
            <div className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-xs tracking-wider">
                  {doc.referenceNumber}
                </p>
                <span
                  className={
                    doc.poaStatus === "confirmed"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }
                >
                  {doc.poaStatus === "confirmed" ? "PAID" : "IOU — UNPAID"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {doc.hubName} · {doc.repName} ·{" "}
                {new Date(doc.issuedAt).toLocaleDateString()}
              </p>
              <ul className="mt-3 space-y-1.5">
                {doc.lines.map((line, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {line.description} × {line.quantity}
                    </span>
                    <span className="tabular-nums">
                      {doc.currency} {line.amount}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">
                  {doc.currency} {doc.totalAmount}
                </span>
              </p>
            </div>
            <Button type="button" className="w-full" onClick={handlePrint}>
              <PrinterIcon className="size-4" /> Print / save as PDF
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PoaEvidenceDialog({
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (file: File, note: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!file) return;
    onSubmit(file, note);
    setFile(null);
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload payment evidence</DialogTitle>
          <DialogDescription>
            Attach the bank transfer or mobile money confirmation for this
            payment-on-arrival record. The desk will verify it and your IOU
            receipt becomes a paid receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Receipt / proof of payment</Label>
            <Input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {file && (
              <p className="text-xs text-muted-foreground">{file.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="poa-evidence-note">Note (optional)</Label>
            <Input
              id="poa-evidence-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. paid at Tema branch, ref 881234"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!file || submitting}>
              {submitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              Upload evidence
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
