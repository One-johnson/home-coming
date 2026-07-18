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
import { useIsCompact } from "@/hooks/use-media-query";
import { paymentStatusBadgeClass } from "@/lib/adminColors";
import { cn } from "@/lib/utils";

export type DetailField = {
  label: string;
  value: React.ReactNode;
  /** Render the value in a monospace, pre-wrapped block (e.g. email bodies). */
  block?: boolean;
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
          "flex w-full flex-col gap-0 p-0",
          isCompact
            ? "max-h-[90dvh] rounded-t-2xl sm:max-w-none"
            : "sm:max-w-lg",
        )}
      >
        {isCompact ? (
          <div
            className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30"
            aria-hidden
          />
        ) : null}
        <SheetHeader className="shrink-0 space-y-1.5 border-b border-border bg-muted/30 px-4 py-4 pr-14 sm:px-6 sm:py-5">
          <SheetTitle className="pr-2 text-lg leading-snug text-ink">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription className="font-mono text-sm tracking-wide">
              {description}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          <dl className="overflow-hidden rounded-xl border border-border divide-y divide-border">
            {fields.map((field) => (
              <div
                key={field.label}
                className="grid gap-1 px-4 py-3 transition-colors even:bg-muted/20 hover:bg-muted/40"
              >
                <dt className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {field.label}
                </dt>
                <dd
                  className={cn(
                    "text-sm leading-relaxed break-words text-ink",
                    field.block &&
                      "mt-1 max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap",
                  )}
                >
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap gap-2 pb-[max(0rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          </div>
        ) : null}
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
