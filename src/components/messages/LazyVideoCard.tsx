"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { YouTubeVideoCard } from "@/components/messages/YouTubeVideoCard";
import { cn } from "@/lib/utils";

export function VideoCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-soft",
        className,
      )}
      aria-hidden
    >
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-[85%]" />
        <Skeleton className="h-4 w-[55%]" />
        <Skeleton className="mt-1 h-3 w-28" />
      </div>
    </div>
  );
}

type LazyVideoCardProps = {
  title: string;
  speaker: string;
  url: string;
  thumbnailUrl?: string | null;
  /** Eagerly mount the first N cards above the fold. */
  eager?: boolean;
  className?: string;
};

export function LazyVideoCard({
  title,
  speaker,
  url,
  thumbnailUrl,
  eager = false,
  className,
}: LazyVideoCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "200px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className={className}>
      {visible ? (
        <YouTubeVideoCard
          title={title}
          speaker={speaker}
          url={url}
          thumbnailUrl={thumbnailUrl}
        />
      ) : (
        <VideoCardSkeleton />
      )}
    </div>
  );
}
