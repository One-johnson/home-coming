import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";

const ctaButtonClassName =
  "min-h-12 px-9 py-4 text-base sm:min-h-[3.25rem] sm:px-10 sm:text-lg";

export function RegistrationCTA() {
  return (
    <Section
      subtitle="Join Us"
      title="Register for The Homecoming"
      className="bg-cream"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        Secure your place at Mountain of the Lord — The Homecoming. Register
        individually or as a group, choose add-ons, and prepare for an
        unforgettable gathering on the mountain.
      </p>
      <div className="flex flex-wrap justify-center gap-5">
        <Button
          href="/registration"
          className={`${ctaButtonClassName} border-gold bg-gold text-ink shadow-elevate hover:bg-gold-dark hover:text-ink`}
        >
          Register Now
        </Button>
        <Button
          href="/accommodation"
          variant="outline"
          className={`${ctaButtonClassName} border-2 border-gold bg-transparent text-ink hover:bg-gold/10 hover:text-ink`}
        >
          Book Accommodation
        </Button>
      </div>
    </Section>
  );
}
