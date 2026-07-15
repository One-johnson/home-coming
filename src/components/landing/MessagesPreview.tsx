"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { YouTubeVideoCard } from "@/components/messages/YouTubeVideoCard";
import { isConvexConfigured } from "@/lib/convex-config";
import { EVENT } from "@/lib/eventConfig";

type VideoItem = {
  _id: string;
  year: number;
  title: string;
  speaker: string;
  url: string;
  thumbnailUrl?: string;
};

function MessagesPreviewContent({ videos }: { videos: VideoItem[] }) {
  const preview = videos.slice(0, 3);

  return (
    <Section
      subtitle="Past Teachings"
      title={`Homecoming ${EVENT.lastHomecomingYear} Messages`}
      className="bg-cream"
    >
      <MotionStagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {preview.map((video) => (
          <MotionItem key={video._id}>
            <YouTubeVideoCard
              title={video.title}
              speaker={video.speaker}
              url={video.url}
              thumbnailUrl={video.thumbnailUrl}
            />
          </MotionItem>
        ))}
        {!preview.length && (
          <p className="col-span-full text-center text-muted-foreground">
            Homecoming videos will appear once Convex is connected.
          </p>
        )}
      </MotionStagger>
      <div className="mt-10 text-center">
        <Button href="/messages" variant="outline">
          View All Messages
        </Button>
      </div>
    </Section>
  );
}

function MessagesPreviewConnected() {
  const videos = useQuery(api.content.listHomecomingVideos);
  return <MessagesPreviewContent videos={videos ?? []} />;
}

export function MessagesPreview() {
  if (!isConvexConfigured()) {
    return <MessagesPreviewContent videos={[]} />;
  }
  return <MessagesPreviewConnected />;
}
