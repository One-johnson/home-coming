import type { Metadata } from "next";
import { Suspense } from "react";
import { Section } from "@/components/ui/Section";
import { PaymentSuccess } from "@/components/payments/PaymentSuccess";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Tour payment confirmed",
  description: "Your Homecoming tour payment is confirmed.",
  path: "/tours/success",
  noIndex: true,
});

export default function ToursSuccessPage() {
  return (
    <Section subtitle="Tours" title="Payment confirmed" className="pt-24">
      <Suspense fallback={<p className="text-center text-muted-foreground">Loading…</p>}>
        <PaymentSuccess
          title="Tour order confirmed"
          description="Your Homecoming tour tickets are confirmed."
          backHref="/tours"
          backLabel="Back to tours"
        />
      </Suspense>
    </Section>
  );
}
