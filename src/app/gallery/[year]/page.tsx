import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { GalleryYearView } from "@/components/gallery/GalleryYearView";
import { listManifestGalleries } from "@/lib/galleryManifest";

type AlbumPageProps = {
  params: Promise<{ year: string }>;
};

export async function generateStaticParams() {
  return listManifestGalleries().map((album) => ({
    year: String(album.year),
  }));
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { year } = await params;
  const albums = listManifestGalleries();
  const album = albums.find((candidate) => candidate.year === Number(year));

  if (!album) {
    notFound();
  }

  const latestYear = albums[0].year;

  return (
    <Section
      subtitle="Past Homecomings"
      title={`Homecoming ${album.year} Photo Gallery`}
      className="pt-24"
    >
      <GalleryYearView album={album} />

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        {albums
          .filter((candidate) => candidate.year !== album.year)
          .map((candidate) => (
            <Link
              key={candidate.year}
              href={`/gallery/${candidate.year}`}
              className="rounded-full border border-border px-4 py-1.5 transition-colors hover:bg-muted"
            >
              Homecoming {candidate.year}
              {candidate.year === latestYear ? (
                <span className="ml-1.5 text-xs opacity-70">latest</span>
              ) : null}
            </Link>
          ))}
        <Link
          href="/gallery"
          className="rounded-full border border-border px-4 py-1.5 transition-colors hover:bg-muted"
        >
          All albums
        </Link>
      </div>
    </Section>
  );
}
