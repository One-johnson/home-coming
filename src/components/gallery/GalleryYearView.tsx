"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import {
  GalleryLightbox,
  type GalleryLightboxImage,
} from "@/components/gallery/GalleryLightbox";
import { trackEvent } from "@/components/Analytics";
import { groupGalleryImages } from "@/lib/galleryGroups";

type Album = {
  year: number;
  title: string;
  theme: string;
  entries: GalleryLightboxImage[];
};

/**
 * One album's photos with day tabs and the autoplaying lightbox. The parent
 * page is a static server component; only the tabs/lightbox need the client.
 */
export function GalleryYearView({ album }: { album: Album }) {
  const [lightbox, setLightbox] = useState<{
    groupId: string;
    index: number;
  } | null>(null);

  const groups = useMemo(
    () => groupGalleryImages(album.entries),
    [album.entries],
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
    trackEvent("gallery_view", "engagement", image.caption ?? album.title);
  };

  return (
    <div>
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
        {album.entries.length} photos from Homecoming {album.year}
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
