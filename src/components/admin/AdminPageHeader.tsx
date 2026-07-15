import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  description?: string;
  actions?: ReactNode;
  className?: string;
};

/** Page-level description + actions. Route title lives in the shell header. */
export function AdminPageHeader({
  description,
  actions,
  className,
}: AdminPageHeaderProps) {
  if (!description && !actions) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3",
        description ? "justify-between" : "justify-end",
        className,
      )}
    >
      {description ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
