"use client";

import { useEffect } from "react";
import { AlertCircleIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EVENT } from "@/lib/eventConfig";

/**
 * Route-segment error boundary. Convex query errors thrown during render
 * (e.g. a bad data state on one deployment) used to blank whole pages;
 * this renders a retryable message instead.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page crashed:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
      <AlertCircleIcon className="size-8 text-amber-600" />
      <h1 className="font-display text-2xl text-primary">
        This page couldn&apos;t load
      </h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading this part of {EVENT.fullTitle}.
        Please try again — if it keeps happening, contact{" "}
        <a
          href={`mailto:${EVENT.supportEmail}`}
          className="font-medium text-primary hover:underline"
        >
          {EVENT.supportEmail}
        </a>
        .
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground/70">
          Error code: {error.digest}
        </p>
      )}
      <Button type="button" onClick={reset} variant="outline" className="gap-2">
        <RotateCcwIcon className="size-4" />
        Try again
      </Button>
    </div>
  );
}
