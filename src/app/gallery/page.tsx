"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import {
  GalleryLightbox,
  type GalleryLightboxImage,
} from "@/components/gallery/GalleryLightbox";
import { trackEvent } from "@/components/Analytics";
import { EVENT } from "@/lib/eventConfig";
import { groupGalleryImages } from "@/lib/galleryGroups";
import { isConvexConfigured } from "@/lib/convex-config";

type Gallery = {
  _id: string;
  year: number;
  theme: string;
  title: string;
  images: { _id: string; imageUrl?: string; caption?: string; storageId?: string }[];
};

function hasRealPhotos(gallery: Gallery) {
  return gallery.images.some((image) => image.storageId || image.imageUrl);
}

function GalleryPageContent({ gallery }: { gallery: Gallery | null }) {
  const [lightbox, setLightbox] = useState<{
    groupId: string;
    index: number;
  } | null>(null);

  const images = useMemo(
    () =>
      gallery?.images
        .filter((image) => image.imageUrl)
        .map((image) => ({
          _id: image._id,
          imageUrl: image.imageUrl!,
          caption: image.caption,
        })) ?? [],
    [gallery],
  );

  const groups = useMemo(() => groupGalleryImages(images), [images]);
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
      image.caption ?? gallery?.title ?? "Gallery photo",
    );
  };

  return (
    <Section
      subtitle="Last Year's Homecoming"
      title={`Homecoming ${EVENT.lastHomecomingYear} Photo Gallery`}
      className="pt-24"
    >
      {gallery ? (
        <div>
          <p className="lead mx-auto mb-10 max-w-3xl text-center">
            {gallery.title} — {gallery.theme}. These photos are from last
            year&apos;s convention at {EVENT.venue}. Browse by day, then tap any
            photo to autoplay that day&apos;s slideshow.
          </p>

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
            {images.length} photos from Homecoming {EVENT.lastHomecomingYear}
          </p>
        </div>
      ) : (
        <p className="text-center text-muted-foreground">
          Photos from Homecoming {EVENT.lastHomecomingYear} will appear once
          Convex is connected.
        </p>
      )}

      <GalleryLightbox
        images={activeGroup?.images ?? []}
        activeIndex={lightbox?.index ?? null}
        onClose={() => setLightbox(null)}
        onIndexChange={(index) =>
          setLightbox((current) =>
            current ? { ...current, index } : current,
          )
        }
      />
    </Section>
  );
}

function GalleryPageConnected() {
  const galleries = useQuery(api.content.listGalleries);
  const lastYearGallery =
    galleries?.find(
      (g) => g.year === EVENT.lastHomecomingYear && hasRealPhotos(g),
    ) ??
    galleries?.find((g) => hasRealPhotos(g)) ??
    null;

  return <GalleryPageContent gallery={lastYearGallery} />;
}

export default function GalleryPage() {
  if (!isConvexConfigured()) {
    return <GalleryPageContent gallery={null} />;
  }
  return <GalleryPageConnected />;
}
