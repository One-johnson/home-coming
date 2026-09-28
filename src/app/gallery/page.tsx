import { Suspense } from "react";
import { Section } from "@/components/ui/Section";
import { GalleryExplorer } from "@/components/gallery/GalleryExplorer";

export default function GalleryPage() {
  return (
    <Suspense
      fallback={
        <Section
          subtitle="Past Homecomings"
          title="Homecoming Photo Gallery"
          className="pt-24"
        >
          <p className="text-center text-muted-foreground">Loading photos…</p>
        </Section>
      }
    >
      <GalleryExplorer />
    </Suspense>
  );
}
