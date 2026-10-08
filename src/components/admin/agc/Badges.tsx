import { AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** "Paid ≠ total" mini badge shown beside a payment-status badge. */
export function AmountMismatchBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
        className,
      )}
    >
      <AlertTriangle className="size-3" />
      Paid ≠ total
    </Badge>
  );
}

/** Amber "n days" chip for rows that have been sitting in review. */
export function AgeBadge({
  ageDays,
  className,
}: {
  /** Whole days the row has waited (computed outside render). */
  ageDays: number;
  className?: string;
}) {
  const days = ageDays;
  if (days < 1) return null;
  const urgent = days >= 3;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        urgent
          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
        className,
      )}
    >
      <Clock className="size-3" />
      {days}d
    </Badge>
  );
}
