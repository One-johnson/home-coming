"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A Dialog whose header and footer stay pinned while only the middle section
 * scrolls — for detail views opened from a table-row click that carry more
 * content than fits on the screen.
 *
 * Layout: the popup is a capped-height flex column with `overflow-hidden`;
 * DialogContent's own scrolling is disabled (the chrome must not scroll), the
 * header block is pinned at the top and the footer block pinned at the bottom,
 * and the only scrollable region is the body. Keep the pinned chrome short —
 * the body gets `max-height − header − footer` on screen.
 *
 * Children render inside the scrollable body. Use the exported RowDetail*
 * helpers below for consistent sections/label-value pairs.
 */
export function RowDetailDialog({
  open,
  onOpenChange,
  title,
  summary,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** One line pinned under the title (e.g. reference + status badges). */
  summary?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned footer — action buttons, e.g. the review decision bar. */
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(85dvh,50rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl",
          className,
        )}
      >
        <div className="shrink-0 border-b p-4 pr-10">
          <DialogHeader className="gap-1">
            <DialogTitle>{title}</DialogTitle>
            {summary ? (
              <DialogDescription className="text-sm">
                {summary}
              </DialogDescription>
            ) : null}
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t bg-muted/30 p-4">{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Section inside a RowDetailDialog body: separated blocks of content. */
export function RowDetailSection({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("border-t py-3 first:border-t-0 first:pt-0", className)}
    >
      {title ? (
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/** Label/value grid for a RowDetailDialog body. */
export function RowDetailList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-2 sm:grid-cols-2", className)}>
      {children}
    </dl>
  );
}

/** One label/value pair inside a RowDetailList. */
export function RowDetailItem({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
