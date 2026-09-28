import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { EVENT } from "@/lib/eventConfig";
import { listManifestGalleries } from "@/lib/galleryManifest";

export default function GalleryIndexPage() {
  const albums = listManifestGalleries();

  return (
    <Section
      subtitle="Past Homecomings"
      title="Homecoming Photo Gallery"
      className="pt-24"
    >
      {albums.length === 0 ? (
        <p className="text-center text-muted-foreground">
          Photos will appear here once the first album is published.
        </p>
      ) : (
        <>
          <p className="lead mx-auto mb-10 max-w-3xl text-center">
            Relive moments from past gatherings at {EVENT.venue}. Pick a year,
            browse by day, then tap any photo to autoplay that day&apos;s
            slideshow.
          </p>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <Link
                key={album.year}
                href={`/gallery/${album.year}`}
                className="group/album block"
              >
                <Card className="card-lift h-full overflow-hidden pt-0">
                  <AspectRatio ratio={3 / 2} className="relative bg-muted">
                    <Image
                      src={album.cover}
                      alt={`Cover photo from Homecoming ${album.year}`}
                      fill
                      className="object-cover transition duration-300 group-hover/album:scale-105"
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      priority={album === albums[0]}
                    />
                  </AspectRatio>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardDescription className="text-base font-semibold text-foreground">
                        Homecoming {album.year}
                      </CardDescription>
                      <Badge variant="outline">{album.count} photos</Badge>
                    </div>
                    <CardDescription className="line-clamp-1">
                      {album.theme}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
