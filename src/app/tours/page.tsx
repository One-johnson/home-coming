import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { ToursCheckout } from "@/components/tours/ToursCheckout";
import { PreferredHotels } from "@/components/tours/PreferredHotels";
import { createPageMetadata, PAGE_SEO } from "@/lib/seo";
import { listFallbackTourPackages } from "@/lib/toursManifest";

export const metadata: Metadata = createPageMetadata(PAGE_SEO.tours);

/**
 * Tours page. The manifest is rendered here for the first paint only —
 * ToursCheckout subscribes to the live `tourPackages.listPublic` query, so
 * dashboard edits and deletions show up without a redeploy. Booking sends
 * slugs and the server re-prices against the database before any payment.
 */
export default function ToursPage() {
  const packages = listFallbackTourPackages();

  return (
    <Section
      subtitle="Conference Tours"
      title="Book Your Tour Packages"
      className="pt-24"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        Choose your tours, pay by bank transfer or Mobile Money, and the finance
        team confirms your ticket. Dates, departure points and prices are
        confirmed at checkout.
      </p>
      <ToursCheckout packages={packages} />
      <div className="mt-16">
        <PreferredHotels />
      </div>
    </Section>
  );
}
