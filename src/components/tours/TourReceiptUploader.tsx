"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { compressImageForUpload } from "@/lib/imageCompress";
import { uploadFileToConvex } from "@/lib/galleryUpload";

/**
 * Receipt upload for a single tour order, shared by the checkout confirmation
 * screen and the public status page. `attachReceipt` authorises on the
 * reference number *and* the booking email, so this component never needs a
 * signed-in session.
 */
export function TourReceiptUploader({
  referenceNumber,
  email,
  receiptUrl,
  variant = "card",
}: {
  referenceNumber: string;
  email: string;
  /** Existing receipt URL, when one is already on file. */
  receiptUrl?: string | null;
  /** `card` for the checkout confirmation, `inline` for the status page. */
  variant?: "card" | "inline";
}) {
  const generateUploadUrl = useMutation(
    api.tourOrders.generateReceiptUploadUrl,
  );
  const attachReceipt = useMutation(api.tourOrders.attachReceipt);
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploaded = status === "done" || Boolean(receiptUrl);
  const [previewUrl, setPreviewUrl] = useState<string | null>(receiptUrl ?? null);

  const handleFile = async (file: File) => {
    setStatus("uploading");
    try {
      const { file: prepared } = await compressImageForUpload(file);
      const storageId = await uploadFileToConvex(prepared, () =>
        generateUploadUrl({}),
      );
      const result = await attachReceipt({
        referenceNumber,
        email,
        storageId,
        contentType: prepared.type || file.type || undefined,
      });
      setFileName(file.name);
      setPreviewUrl(result.receiptUrl ?? null);
      setStatus("done");
      toast.success("Receipt uploaded — finance will verify it");
    } catch (err) {
      setStatus("idle");
      toast.error(
        err instanceof Error ? err.message : "Could not upload that receipt",
      );
    }
  };

  const card = variant === "card";

  return (
    <div
      className={
        card
          ? "space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-left"
          : "space-y-2"
      }
    >
      <p
        className={
          card
            ? "text-base font-medium text-foreground"
            : "text-sm font-medium text-foreground"
        }
      >
        {uploaded ? "Your payment receipt" : "Upload your payment receipt"}
      </p>
      <p className="text-sm text-muted-foreground">
        {uploaded
          ? "Finance has it and will confirm your tickets once the payment clears. You can replace it if you sent the wrong file."
          : "Attach the transfer or MoMo screenshot so finance can confirm your tickets without chasing you. Photo or PDF, up to 8 MB."}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={uploaded ? "outline" : "default"}
          size="sm"
          disabled={status === "uploading"}
          onClick={() => inputRef.current?.click()}
        >
          {status === "uploading" ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <UploadIcon className="size-3.5" />
              {uploaded ? "Replace receipt" : "Choose receipt"}
            </>
          )}
        </Button>

        {(previewUrl || receiptUrl) && uploaded ? (
          <a
            href={previewUrl ?? receiptUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            View uploaded file
          </a>
        ) : null}

        {status === "done" ? (
          <span className="text-xs font-medium text-primary">
            Received{fileName ? ` · ${fileName}` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

