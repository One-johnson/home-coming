"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import {
  GalleryLightbox,
  type GalleryLightboxImage,
} from "@/components/gallery/GalleryLightbox";
import { trackEvent } from "@/components/Analytics";
import { EVENT } from "@/lib/eventConfig";
import { groupGalleryImages } from "@/lib/galleryGroups";
import {
  galleryManifest,
  getManifestGallery,
  type ManifestGallery,
} from "@/lib/galleryManifest";
import { cn } from "@/lib/utils";

function GalleryYear({
  gallery,
  introNote,
}: {
  gallery: ManifestGallery & { entries: GalleryLightboxImage[] };
  introNote?: string;
}) {
  const [lightbox, setLightbox] = useState<{
    groupId: string;
    index: number;
  } | null>(null);

  const groups = useMemo(
    () => groupGalleryImages(gallery.entries),
    [gallery.entries],
  );
  const defaultGroupId = groups[0]?.id ?? "group-0";
  const activeGroup =
    groups.find((group) => group.id === lightbox?.groupId) ?? null;

  const handleImageClick = (
    groupId: string,
    localIndex: number,
    image: GalleryLightboxImage,
  ) => {
    setLightbox({ groupId, index: localIndex });
    trackEvent(
      "gallery_view",
      "engagement",
      image.caption ?? gallery.title,
    );
  };

  return (
    <div>
      {introNote ? (
        <p className="lead mx-auto mb-10 max-w-3xl text-center">{introNote}</p>
      ) : null}

      <Tabs defaultValue={defaultGroupId} className="w-full">
        <div className="-mx-4 mb-8 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <TabsList className="mx-auto flex h-auto w-max min-w-full max-w-3xl flex-nowrap justify-start gap-1 bg-cream p-1 sm:flex-wrap sm:justify-center">
            {groups.map((group) => (
              <TabsTrigger
                key={group.id}
                value={group.id}
                className="shrink-0 rounded-full px-4 py-2.5 text-sm data-active:bg-primary data-active:text-primary-foreground"
              >
                {group.label}
                <span className="ml-2 text-xs opacity-70">
                  ({group.images.length})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {groups.map((group) => (
          <TabsContent key={group.id} value={group.id} className="mt-0">
            <GalleryGrid
              images={group.images}
              onImageClick={(localIndex, image) =>
                handleImageClick(group.id, localIndex, image)
              }
            />
          </TabsContent>
        ))}
      </Tabs>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {gallery.entries.length} photos from Homecoming {gallery.year}
      </p>

      <GalleryLightbox
        images={activeGroup?.images ?? []}
        activeIndex={lightbox?.index ?? null}
        onClose={() => setLightbox(null)}
        onIndexChange={(index) =>
          setLightbox((current) => (current ? { ...current, index } : current))
        }
      />
    </div>
  );
}

export function GalleryExplorer({ year: yearProp }: { year?: number }) {
  const searchParams = useSearchParams();
  const year =
    yearProp ?? (Number(searchParams.get("year")) || undefined);
  const gallery = getManifestGallery(year);
  const availableYears = galleryManifest
    .map((g) => g.year)
    .sort((a, b) => b - a);
  const latestYear = availableYears[0];

  if (!gallery) {
    return (
      <p className="text-center text-muted-foreground">
        Photos will appear here once the first album is published.
      </p>
    );
  }

  const showYearSwitcher = availableYears.length > 1;

  return (
    <div className="space-y-8">
      {showYearSwitcher ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {availableYears.map((availableYear) => (
            <a
              key={availableYear}
              href={`/gallery?year=${availableYear}`}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                availableYear === gallery.year
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {availableYear}
              {availableYear === latestYear ? (
                <span className="ml-1.5 text-xs opacity-70">latest</span>
              ) : null}
            </a>
          ))}
        </div>
      ) : null}

      <GalleryYear
        gallery={gallery}
        introNote={
          gallery.year === latestYear
            ? `These photos are from last year's convention at ${EVENT.venue}. Browse by day, then tap any photo to autoplay that day's slideshow.`
            : `Photos from Homecoming ${gallery.year} (${gallery.theme}).`
        }
      />
    </div>
  );
}
