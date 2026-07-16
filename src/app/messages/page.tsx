"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/button";
import {
  LazyVideoCard,
  VideoCardSkeleton,
} from "@/components/messages/LazyVideoCard";
import { isConvexConfigured } from "@/lib/convex-config";
import { EVENT } from "@/lib/eventConfig";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const EAGER_COUNT = 4;

type VideoItem = {
  _id: string;
  year: number;
  title: string;
  speaker: string;
  url: string;
  thumbnailUrl?: string;
};

function MessagesPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-2 pt-2"
      aria-label="Messages pagination"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
        Previous
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {pages.map((pageNumber) => (
          <Button
            key={pageNumber}
            type="button"
            variant={pageNumber === page ? "default" : "outline"}
            size="sm"
            className={cn("min-w-9", pageNumber === page && "pointer-events-none")}
            onClick={() => onPageChange(pageNumber)}
            aria-label={`Page ${pageNumber}`}
            aria-current={pageNumber === page ? "page" : undefined}
          >
            {pageNumber}
          </Button>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        Next
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

function MessagesGrid({
  videos,
  isLoading,
}: {
  videos: VideoItem[];
  isLoading?: boolean;
}) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageVideos = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return videos.slice(start, start + PAGE_SIZE);
  }, [videos, safePage]);

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Section
      subtitle="Teachings"
      title={`Homecoming ${EVENT.lastHomecomingYear} Messages`}
      className="pt-24"
    >
      <div className="space-y-8">
        <p className="max-w-3xl text-muted-foreground">
          Watch teachings from the {EVENT.lastHomecomingYear} Homecoming
          Convention. Tap a card to open the recording.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: PAGE_SIZE }, (_, i) => (
                <VideoCardSkeleton key={i} />
              ))
            : pageVideos.map((video, index) => (
                <LazyVideoCard
                  key={video._id}
                  title={video.title}
                  speaker={video.speaker}
                  url={video.url}
                  thumbnailUrl={video.thumbnailUrl}
                  eager={index < EAGER_COUNT}
                />
              ))}
        </div>

        {!isLoading && videos.length > 0 && (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, videos.length)} of {videos.length}
            </p>
            <MessagesPagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={handlePageChange}
            />
          </div>
        )}

        {!isLoading && !videos.length && (
          <p className="text-center text-muted-foreground">
            Homecoming videos will appear once Convex is connected.
          </p>
        )}
      </div>
    </Section>
  );
}

function MessagesPageConnected() {
  const videos = useQuery(api.content.listHomecomingVideos);

  if (videos === undefined) {
    return <MessagesGrid videos={[]} isLoading />;
  }

  return <MessagesGrid videos={videos} />;
}

export default function MessagesPage() {
  if (!isConvexConfigured()) {
    return <MessagesGrid videos={[]} />;
  }
  return <MessagesPageConnected />;
}
