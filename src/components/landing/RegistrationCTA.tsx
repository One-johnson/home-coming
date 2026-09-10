import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";
import { SITE_FEATURES } from "@/lib/eventConfig";
import { homeContent } from "@/lib/siteContent";

const ctaButtonClassName =
  "min-h-12 px-9 py-4 text-base sm:min-h-[3.25rem] sm:px-10 sm:text-lg";

export function RegistrationCTA() {
  const { registrationCta } = homeContent;

  return (
    <Section
      subtitle={registrationCta.subtitle}
      title={registrationCta.title}
      className="bg-cream"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        {registrationCta.body}
      </p>
      <div className="flex flex-wrap justify-center gap-5">
        <Button
          href="/registration"
          className={`${ctaButtonClassName} border-gold bg-gold text-ink shadow-elevate hover:bg-gold-dark hover:text-ink`}
        >
          Register Now
        </Button>
        {SITE_FEATURES.accommodationEnabled ? (
          <Button
            href="/accommodation"
            variant="outline"
            className={`${ctaButtonClassName} border-2 border-gold bg-transparent text-ink hover:bg-gold/10 hover:text-ink`}
          >
            Book Accommodation
          </Button>
        ) : (
          <Button
            href="/tours"
            variant="outline"
            className={`${ctaButtonClassName} border-2 border-gold bg-transparent text-ink hover:bg-gold/10 hover:text-ink`}
          >
            View Tours
          </Button>
        )}
      </div>
    </Section>
  );
}
