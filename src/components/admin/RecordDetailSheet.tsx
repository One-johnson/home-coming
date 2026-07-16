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
import { useIsCompact } from "@/hooks/use-media-query";
import { paymentStatusBadgeClass } from "@/lib/adminColors";
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
  const isCompact = useIsCompact();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isCompact ? "bottom" : "right"}
        className={cn(
          "w-full gap-0 overflow-y-auto p-0",
          isCompact
            ? "max-h-[90dvh] rounded-t-2xl sm:max-w-none"
            : "sm:max-w-md",
        )}
      >
        {isCompact ? (
          <div
            className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
            aria-hidden
          />
        ) : null}
        <SheetHeader className="space-y-1 border-b border-border px-4 py-4 pr-14 sm:px-6 sm:py-5">
          <SheetTitle className="pr-2 text-lg leading-snug">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="font-mono text-sm tracking-wide">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="space-y-5 px-4 py-5 sm:px-6">
          {fields.map((field) => (
            <div key={field.label} className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {field.label}
              </p>
              <div className="text-sm leading-relaxed break-words text-ink sm:text-base">
                {field.value}
              </div>
            </div>
          ))}
          {footer ? (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
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
      className={cn("capitalize", paymentStatusBadgeClass(status))}
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
      {PAYMENT_STATUSES.map((status) => {
        const active = current === status;
        return (
          <Button
            key={status}
            size="sm"
            variant="outline"
            disabled={disabled || active}
            onClick={() => onChange(status)}
            className={cn(
              "capitalize",
              active && paymentStatusBadgeClass(status),
              active && "opacity-100 shadow-sm",
            )}
          >
            {status.replaceAll("_", " ")}
          </Button>
        );
      })}
    </div>
  );
}
