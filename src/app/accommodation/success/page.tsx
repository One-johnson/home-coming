import type { Metadata } from "next";
import { Suspense } from "react";
import { Section } from "@/components/ui/Section";
import { PaymentSuccess } from "@/components/payments/PaymentSuccess";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Accommodation payment confirmed",
  description: "Your campus housing payment is confirmed.",
  path: "/accommodation/success",
  noIndex: true,
});

export default function AccommodationSuccessPage() {
  return (
    <Section
      subtitle="Stay"
      title="Payment confirmed"
      className="pt-24"
    >
      <Suspense fallback={<p className="text-center text-muted-foreground">Loading…</p>}>
        <PaymentSuccess
          title="Booking confirmed"
          description="Your campus housing booking payment was successful."
          backHref="/accommodation"
          backLabel="Back to accommodation"
        />
      </Suspense>
    </Section>
  );
}
