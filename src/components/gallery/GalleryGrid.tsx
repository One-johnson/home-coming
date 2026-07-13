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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image, index) => (
        <Button
          key={image._id}
          variant="ghost"
          className="card-lift h-auto overflow-hidden rounded-2xl p-0 shadow-soft ring-1 ring-border hover:bg-transparent"
          onClick={() => onImageClick(index, image)}
        >
          <AspectRatio ratio={4 / 3} className="relative w-full bg-muted">
            <Image
              src={image.imageUrl}
              alt={image.caption ?? "Homecoming photo"}
              fill
              className="object-cover transition duration-300 hover:scale-105"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
            {image.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-left text-sm text-white">
                {image.caption}
              </div>
            )}
          </AspectRatio>
        </Button>
      ))}
    </div>
  );
}
