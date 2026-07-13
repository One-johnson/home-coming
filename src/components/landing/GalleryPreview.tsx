"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EVENT } from "@/lib/eventConfig";
import { isConvexConfigured } from "@/lib/convex-config";

type GalleryImage = {
  _id: string;
  imageUrl?: string;
  caption?: string;
  storageId?: string;
};

type GalleryItem = {
  _id: string;
  year: number;
  title: string;
  theme: string;
  images: GalleryImage[];
};

function hasRealPhotos(gallery: GalleryItem) {
  return gallery.images.some((image) => image.storageId || image.imageUrl);
}

function GalleryPreviewContent({ gallery }: { gallery: GalleryItem | null }) {
  const featured = gallery?.images.slice(0, 3) ?? [];

  return (
    <Section
      subtitle="Last Year's Homecoming"
      title={`Homecoming ${EVENT.lastHomecomingYear} Photos`}
      dark
    >
      {gallery && (
        <p className="lead lead-light mx-auto mb-10 max-w-3xl text-center">
          Relive moments from last year&apos;s gathering at {EVENT.venue},{" "}
          {EVENT.location}. This year&apos;s convention is{" "}
          {EVENT.dates.split("–")[0]?.trim() ?? EVENT.dates}.
        </p>
      )}

      <MotionStagger className="grid gap-6 md:grid-cols-3">
        {featured.map((image) => (
          <MotionItem key={image._id}>
            <Link href="/gallery" className="group/card block h-full">
              <Card className="card-lift h-full overflow-hidden border-white/10 bg-white/5 pt-0 ring-1 ring-white/10 transition-colors hover:ring-gold-light/40">
                <AspectRatio ratio={4 / 3} className="bg-black/20">
                  {image.imageUrl ? (
                    <Image
                      src={image.imageUrl}
                      alt={image.caption ?? "Homecoming 2025 photo"}
                      fill
                      className="object-cover transition duration-300 group-hover/card:scale-105"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : null}
                </AspectRatio>
                {image.caption && (
                  <CardHeader>
                    <CardDescription className="line-clamp-2 text-white/80">
                      {image.caption}
                    </CardDescription>
                  </CardHeader>
                )}
              </Card>
            </Link>
          </MotionItem>
        ))}
        {!featured.length && (
          <p className="col-span-full text-center text-white/80">
            Photos from last year&apos;s Homecoming will appear here once
            connected.
          </p>
        )}
      </MotionStagger>

      {gallery && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Badge
            variant="outline"
            className="border-gold-light/50 text-gold-light"
          >
            {gallery.year}
          </Badge>
          <span className="text-sm text-white/75">{gallery.title}</span>
        </div>
      )}

      <div className="mt-10 text-center">
        <Button
          href="/gallery"
          variant="outline"
          className="min-h-12 border-gold bg-gold px-9 py-4 text-base text-ink hover:bg-gold-dark hover:text-ink sm:px-10 sm:text-lg"
        >
          View All {EVENT.lastHomecomingYear} Photos
        </Button>
      </div>
    </Section>
  );
}

function GalleryPreviewConnected() {
  const galleries = useQuery(api.content.listGalleries);
  const lastYearGallery =
    galleries?.find(
      (g) => g.year === EVENT.lastHomecomingYear && hasRealPhotos(g),
    ) ??
    galleries?.find((g) => hasRealPhotos(g)) ??
    null;

  return <GalleryPreviewContent gallery={lastYearGallery} />;
}

export function GalleryPreview() {
  if (!isConvexConfigured()) {
    return <GalleryPreviewContent gallery={null} />;
  }
  return <GalleryPreviewConnected />;
}
