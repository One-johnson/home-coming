"use client";

import { AboutHero } from "@/components/about/AboutHero";
import { AboutNav } from "@/components/about/AboutNav";
import { ChurchAbout } from "@/components/about/ChurchAbout";
import { ConventionAbout } from "@/components/about/ConventionAbout";
import { FirstLadyWelcome } from "@/components/about/FirstLadyWelcome";
import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";
import { aboutContent } from "@/lib/siteContent";

export default function AboutPage() {
  const { cta } = aboutContent;

  return (
    <>
      <AboutHero />
      <AboutNav />
      <ChurchAbout />
      <ConventionAbout />
      <FirstLadyWelcome />

      <Section dark subtitle={cta.subtitle} title={cta.title}>
        <p className="lead lead-light mx-auto mb-10 max-w-3xl text-center text-xl md:text-2xl">
          {cta.body}
        </p>
        <div className="flex flex-wrap justify-center gap-5">
          <Button
            href="/registration"
            className="min-h-12 border-gold-light bg-gradient-to-r from-gold-light via-[#f0e6c8] to-gold px-9 py-4 text-base text-ink shadow-elevate hover:from-gold hover:via-gold-light hover:to-gold-dark hover:text-ink sm:min-h-[3.25rem] sm:px-10 sm:text-lg"
          >
            {cta.primaryLabel}
          </Button>
          <Button
            href="/accommodation"
            variant="outline"
            className="min-h-12 border-2 border-gold bg-transparent px-9 py-4 text-base text-paper hover:border-gold-light hover:bg-gold/10 hover:text-paper sm:min-h-[3.25rem] sm:px-10 sm:text-lg"
          >
            {cta.secondaryLabel}
          </Button>
        </div>
      </Section>
    </>
  );
}
