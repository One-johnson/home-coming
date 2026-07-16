"use client";

import Image from "next/image";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import type { GalleryLightboxImage } from "@/components/gallery/GalleryLightbox";

type GalleryGridProps = {
  images: GalleryLightboxImage[];
  onImageClick: (localIndex: number, image: GalleryLightboxImage) => void;
};

export function GalleryGrid({
  images,
  onImageClick,
}: GalleryGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {images.map((image, index) => (
        <Button
          key={image._id}
          variant="ghost"
          className="card-lift h-auto overflow-hidden rounded-lg p-0 shadow-soft ring-1 ring-border hover:bg-transparent"
          onClick={() => onImageClick(index, image)}
        >
          <AspectRatio ratio={4 / 3} className="relative w-full bg-muted">
            <Image
              src={image.imageUrl}
              alt={image.caption ?? "Homecoming photo"}
              fill
              className="object-cover transition duration-300 hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
            />
            {image.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-left text-[11px] leading-snug text-white sm:text-xs">
                {image.caption}
              </div>
            )}
          </AspectRatio>
        </Button>
      ))}
    </div>
  );
}
