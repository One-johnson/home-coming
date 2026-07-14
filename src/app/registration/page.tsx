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
        Choose individual or group registration, select your country or region for
        the correct pricing and payment gateway, add optional extras, and complete
        your booking.
      </p>
      <RegistrationForm />
    </Section>
  );
}
