import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { TourStatusLookup } from "@/components/tours/TourStatusLookup";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Check your tour order",
  description:
    "Look up a tour booking by reference number and email, check its payment status, and upload a payment receipt.",
  path: "/tours/status",
  // Contains per-guest information; never index it.
  noIndex: true,
});

/**
 * Public order lookup. Guests can return days later with the reference from
 * their confirmation and the email the booking used — `tourOrders.getStatus`
 * requires both, so neither alone reveals anything.
 */
export default function TourStatusPage() {
  return (
    <Section
      subtitle="Tour booking"
      title="Check your order"
      className="pt-24"
    >
      <TourStatusLookup />
    </Section>
  );
}
