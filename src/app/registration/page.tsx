import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { RegistrationForm } from "@/components/registration/RegistrationForm";
import { createPageMetadata, PAGE_SEO } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata(PAGE_SEO.registration);

export default function RegistrationPage() {
  return (
    <Section
      subtitle="Register"
      title="Register for The Homecoming"
      className="pt-24"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        Choose individual or group registration, select your region for pricing,
        pay with Paystack (Ghana / West Africa) or choose Paystack or Stripe
        elsewhere, then complete your booking.
      </p>
      <RegistrationForm />
    </Section>
  );
}
