import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { AccommodationPortal } from "@/components/accommodation/AccommodationPortal";
import { LinkButton as Button } from "@/components/ui/app-button";
import { SITE_FEATURES } from "@/lib/eventConfig";
import { createPageMetadata, PAGE_SEO } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  ...PAGE_SEO.accommodation,
  ...(SITE_FEATURES.accommodationEnabled
    ? {}
    : { noIndex: true, title: "Accommodation — Coming Soon" }),
});

export default function AccommodationPage() {
  if (!SITE_FEATURES.accommodationEnabled) {
    return (
      <Section
        subtitle="Stay on the Mountain"
        title="Accommodation Coming Soon"
        className="pt-24"
      >
        <p className="lead mx-auto mb-10 max-w-2xl text-center">
          Campus housing and hotel options are being finalized. Check back soon,
          or register for Homecoming in the meantime.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button
            href="/registration"
            className="min-h-12 border-gold bg-gold px-8 py-3.5 text-base text-ink hover:bg-gold-dark hover:text-ink"
          >
            Register Now
          </Button>
          <Button
            href="/"
            variant="outline"
            className="min-h-12 border-2 border-gold bg-transparent px-8 py-3.5 text-base text-ink hover:bg-gold/10 hover:text-ink"
          >
            Back to Home
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section
      subtitle="Stay on the Mountain"
      title="Book Your Accommodation"
      className="pt-24"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        Book campus housing at Anagkazo Campus or explore our list of preferred
        hotels near Mampong, Ghana.
      </p>
      <AccommodationPortal />
    </Section>
  );
}
