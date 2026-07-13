import Image from "next/image";
import { Play } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getYouTubeThumbnail, getYouTubeVideoId } from "@/lib/youtube";
import { cn } from "@/lib/utils";

type YouTubeVideoCardProps = {
  title: string;
  speaker: string;
  url: string;
  className?: string;
};

export function YouTubeVideoCard({
  title,
  speaker,
  url,
  className,
}: YouTubeVideoCardProps) {
  const videoId = getYouTubeVideoId(url);

  if (!videoId) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("group block", className)}
      aria-label={`Watch ${title} on YouTube`}
    >
      <Card className="h-full overflow-hidden pt-0 shadow-soft ring-1 ring-border transition-shadow group-hover:shadow-elevate">
        <div className="relative aspect-video w-full bg-charcoal">
          <Image
            src={getYouTubeThumbnail(videoId)}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <span className="absolute inset-0 bg-charcoal/25 transition-colors group-hover:bg-charcoal/35" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold bg-ink/80 text-gold shadow-elevate transition-transform group-hover:scale-105">
              <Play className="ml-1 h-6 w-6 fill-current" aria-hidden />
            </span>
          </span>
        </div>
        <CardHeader className="gap-1">
          <CardTitle className="line-clamp-2 text-base leading-snug">{title}</CardTitle>
          <CardDescription>{speaker}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Watch on YouTube
          </p>
        </CardContent>
      </Card>
    </a>
  );
}
