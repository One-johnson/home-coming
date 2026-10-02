import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { ToursCheckout } from "@/components/tours/ToursCheckout";
import { PreferredHotels } from "@/components/tours/PreferredHotels";
import { createPageMetadata, PAGE_SEO } from "@/lib/seo";
import { listTourPackages } from "@/lib/toursManifest";

export const metadata: Metadata = createPageMetadata(PAGE_SEO.tours);

/**
 * Static tours page: package content comes from the repo-hosted manifest
 * (verified at build time), so there are no Convex queries for package
 * data. Booking still resolves slugs against the live database and
 * re-prices server-side before any payment.
 */
export default function ToursPage() {
  const packages = listTourPackages();

  return (
    <Section
      subtitle="Homecoming Tours"
      title="Book Your Tour Packages"
      className="pt-24"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        Two Homecoming tours are available — Accra on Monday, November 1st and
        Mountain on Thursday, November 4th. Select a package to book tickets;
        you can add both before payment.
      </p>
      <ToursCheckout packages={packages} />
      <div className="mt-16">
        <PreferredHotels />
      </div>
    </Section>
  );
}
