"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { YouTubeVideoCard } from "@/components/messages/YouTubeVideoCard";
import { isConvexConfigured } from "@/lib/convex-config";
import { EVENT } from "@/lib/eventConfig";

type VideoItem = {
  _id: string;
  year: number;
  title: string;
  speaker: string;
  url: string;
};

function MessagesPageContent({ videos }: { videos: VideoItem[] }) {
  return (
    <Section
      subtitle="Teachings"
      title={`Homecoming ${EVENT.lastHomecomingYear} Messages`}
      className="pt-24"
    >
      <div className="space-y-8">
        <p className="max-w-3xl text-muted-foreground">
          Watch teachings from the {EVENT.lastHomecomingYear} Homecoming Convention.
          Tap a thumbnail to open the video on YouTube.
        </p>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <YouTubeVideoCard
              key={video._id}
              title={video.title}
              speaker={video.speaker}
              url={video.url}
            />
          ))}
        </div>

        {!videos.length && (
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
  return <MessagesPageContent videos={videos ?? []} />;
}

export default function MessagesPage() {
  if (!isConvexConfigured()) {
    return <MessagesPageContent videos={[]} />;
  }
  return <MessagesPageConnected />;
}
