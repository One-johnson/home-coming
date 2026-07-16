"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getDerivedThumbnailUrl,
  getMediaHostLabel,
  getYouTubeVideoId,
  isRumbleUrl,
} from "@/lib/mediaLinks";
import { cn } from "@/lib/utils";

type YouTubeVideoCardProps = {
  title: string;
  speaker: string;
  url: string;
  thumbnailUrl?: string | null;
  className?: string;
};

export function YouTubeVideoCard({
  title,
  speaker,
  url,
  thumbnailUrl,
  className,
}: YouTubeVideoCardProps) {
  const href = url.trim();
  const hostLabel = getMediaHostLabel(href);
  const isPlayableHost = Boolean(getYouTubeVideoId(href)) || isRumbleUrl(href);
  const [resolvedThumb, setResolvedThumb] = useState<string | null>(
    thumbnailUrl ?? getDerivedThumbnailUrl(href),
  );

  useEffect(() => {
    const derived = getDerivedThumbnailUrl(href);
    // Prefer YouTube-derived / stored thumbs, but always re-resolve Rumble:
    // oEmbed often returns a frame-grab, while the watch page uses the custom poster.
    const initial = isRumbleUrl(href)
      ? null
      : (thumbnailUrl ?? derived);
    setResolvedThumb(initial ?? thumbnailUrl ?? derived);

    if (!href || (!isRumbleUrl(href) && initial)) return;

    let cancelled = false;
    void fetch(`/api/media-thumbnail?url=${encodeURIComponent(href)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { thumbnailUrl?: string | null } | null) => {
        if (!cancelled && data?.thumbnailUrl) {
          setResolvedThumb(data.thumbnailUrl);
        }
      })
      .catch(() => {
        // Keep placeholder artwork.
      });

    return () => {
      cancelled = true;
    };
  }, [href, thumbnailUrl]);

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("group block", className)}
      aria-label={`Open ${title} on ${hostLabel}`}
    >
      <Card className="h-full overflow-hidden pt-0 shadow-soft ring-1 ring-border transition-shadow group-hover:shadow-elevate">
        <div className="relative aspect-video w-full overflow-hidden bg-charcoal">
          {resolvedThumb ? (
            // Rumble CDNs use rotating hostnames; plain img avoids next/image allowlist churn.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedThumb}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-charcoal via-soft-ink to-charcoal" />
          )}
          <span className="absolute inset-0 bg-charcoal/25 transition-colors group-hover:bg-charcoal/35" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold bg-ink/80 text-gold shadow-elevate transition-transform group-hover:scale-105">
              {isPlayableHost ? (
                <Play className="ml-1 h-6 w-6 fill-current" aria-hidden />
              ) : (
                <ExternalLink className="h-6 w-6" aria-hidden />
              )}
            </span>
          </span>
        </div>
        <CardHeader className="gap-1">
          <CardTitle className="line-clamp-2 text-base leading-snug">
            {title}
          </CardTitle>
          <CardDescription>{speaker}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs tracking-wider text-muted-foreground uppercase">
            Watch on {hostLabel}
          </p>
        </CardContent>
      </Card>
    </a>
  );
}
