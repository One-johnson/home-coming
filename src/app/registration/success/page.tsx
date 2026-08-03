import type { Metadata } from "next";
import { Suspense } from "react";
import { Section } from "@/components/ui/Section";
import { PaymentSuccess } from "@/components/payments/PaymentSuccess";
import { EVENT } from "@/lib/eventConfig";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Registration payment confirmed",
  description: `Your registration payment for ${EVENT.fullTitle} is confirmed.`,
  path: "/registration/success",
  noIndex: true,
});

export default function RegistrationSuccessPage() {
  return (
    <Section
      subtitle="Register"
      title="Payment confirmed"
      className="pt-24"
    >
      <Suspense fallback={<p className="text-center text-muted-foreground">Loading…</p>}>
        <PaymentSuccess
          title="Registration complete"
          description={`Thank you for registering for ${EVENT.fullTitle}.`}
          backHref="/registration"
          backLabel="Back to registration"
        />
      </Suspense>
    </Section>
  );
}
