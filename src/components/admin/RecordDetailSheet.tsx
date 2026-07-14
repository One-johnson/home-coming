"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type DetailField = {
  label: string;
  value: React.ReactNode;
};

type RecordDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: DetailField[];
  footer?: React.ReactNode;
};

export function RecordDetailSheet({
  open,
  onOpenChange,
  title,
  description,
  fields,
  footer,
}: RecordDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader className="space-y-1 border-b border-border px-6 py-5 pr-14">
          <SheetTitle className="pr-2 text-lg leading-snug">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="font-mono text-xs">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="space-y-5 px-6 py-5">
          {fields.map((field) => (
            <div key={field.label} className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {field.label}
              </p>
              <div className="text-sm leading-relaxed text-ink break-words">
                {field.value}
              </div>
            </div>
          ))}
          {footer ? (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2 pt-1">{footer}</div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        status === "paid" || status === "mock_paid"
          ? "border-emerald-300 text-emerald-800"
          : status === "failed"
            ? "border-red-300 text-red-800"
            : "border-amber-300 text-amber-800",
      )}
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

export const PAYMENT_STATUSES = [
  "pending_payment",
  "paid",
  "failed",
  "mock_paid",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function PaymentStatusButtons({
  current,
  onChange,
  disabled,
}: {
  current?: string;
  onChange: (status: PaymentStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PAYMENT_STATUSES.map((status) => (
        <Button
          key={status}
          size="sm"
          variant={current === status ? "default" : "outline"}
          disabled={disabled || current === status}
          onClick={() => onChange(status)}
          className="capitalize"
        >
          {status.replaceAll("_", " ")}
        </Button>
      ))}
    </div>
  );
}
