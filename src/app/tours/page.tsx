import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { ToursCheckout } from "@/components/tours/ToursCheckout";
import { createPageMetadata, PAGE_SEO } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata(PAGE_SEO.tours);

export default function ToursPage() {
  return (
    <Section
      subtitle="Homecoming Tours"
      title="Book Your Tour Packages"
      className="pt-24"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        Browse full tour itineraries below. Select a package to book tickets in
        a quick checkout sheet — you can add more tours before payment.
      </p>
      <ToursCheckout />
    </Section>
  );
}
