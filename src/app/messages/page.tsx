"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import {
  LazyVideoCard,
  VideoCardSkeleton,
} from "@/components/messages/LazyVideoCard";
import { isConvexConfigured } from "@/lib/convex-config";
import { EVENT } from "@/lib/eventConfig";

const EAGER_COUNT = 6;
const SKELETON_COUNT = 6;

type VideoItem = {
  _id: string;
  year: number;
  title: string;
  speaker: string;
  url: string;
  thumbnailUrl?: string;
};

function MessagesGrid({
  videos,
  isLoading,
}: {
  videos: VideoItem[];
  isLoading?: boolean;
}) {
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

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <VideoCardSkeleton key={i} />
              ))
            : videos.map((video, index) => (
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
