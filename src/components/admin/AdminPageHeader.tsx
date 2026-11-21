import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  /** One short sentence; longer how-to text belongs in the page guide. */
  description?: string;
  /** Small status next to the description, e.g. a "Read-only" badge. */
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Page-level description + actions. Route title lives in the shell header. */
export function AdminPageHeader({
  description,
  badge,
  actions,
  className,
}: AdminPageHeaderProps) {
  if (!description && !actions && !badge) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        description || badge ? "justify-between" : "justify-end",
        className,
      )}
    >
      {description || badge ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
          {badge}
        </div>
      ) : null}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
