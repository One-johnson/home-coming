"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CircleCheck,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAdminGuide,
  type GuideStepKind,
} from "@/lib/adminGuides";
import { cn } from "@/lib/utils";

/**
 * "How to" for the page you are on.
 *
 * Mounted once in the console header: it looks up the current route in the
 * guide registry, so every page with an entry gets the same affordance without
 * importing anything itself. A route with no entry renders nothing at all.
 */

const STEP_STYLES: Record<
  GuideStepKind,
  { icon: typeof CircleCheck; label: string; box: string; text: string }
> = {
  do: {
    icon: CircleCheck,
    label: "Do",
    box: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/30",
    text: "text-emerald-800 dark:text-emerald-300",
  },
  never: {
    icon: ShieldAlert,
    label: "Never",
    box: "border-rose-200 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/30",
    text: "text-rose-800 dark:text-rose-300",
  },
  "if-fails": {
    icon: AlertTriangle,
    label: "If it fails",
    box: "border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/30",
    text: "text-amber-800 dark:text-amber-300",
  },
};

export function PageGuide() {
  const pathname = usePathname();
  const guide = getAdminGuide(pathname);
  const [open, setOpen] = useState(false);

  if (!guide) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 gap-1.5"
        aria-label={`How to use ${guide.title}`}
        title={`How to use ${guide.title}`}
        onClick={() => setOpen(true)}
      >
        <BookOpen className="size-3.5" />
        <span className="hidden md:inline">How to</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>How to use {guide.title}</DialogTitle>
            <DialogDescription>{guide.intro}</DialogDescription>
          </DialogHeader>

          <ol className="space-y-2">
            {guide.steps.map((step, index) => {
              const style = step.kind ? STEP_STYLES[step.kind] : null;
              const Icon = style?.icon;
              return (
                <li
                  key={index}
                  className={cn(
                    "text-sm",
                    style
                      ? cn("rounded-lg border border-l-4 p-2", style.box)
                      : "flex gap-2 text-muted-foreground",
                  )}
                >
                  {style && Icon ? (
                    <>
                      <p
                        className={cn(
                          "mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide",
                          style.text,
                        )}
                      >
                        <span className="tabular-nums">{index + 1}.</span>
                        <Icon className="size-3.5" />
                        {style.label}
                      </p>
                      <span className="text-muted-foreground dark:text-foreground/80">
                        {step.text}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {index + 1}.
                      </span>
                      <span>{step.text}</span>
                    </>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-[11px] text-muted-foreground">
              {guide.runbookLink
                ? "The arrival runbook covers this job in full, with the failure cases."
                : "The arrival runbook covers the arrival-day jobs in full."}
            </p>
            <Link
              href="/admin/help"
              className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
              onClick={() => setOpen(false)}
            >
              <BookOpen className="size-3.5" /> Open the runbook
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
