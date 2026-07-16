"use client";

import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isConvexConfigured } from "@/lib/convex-config";

type AboutData = {
  history: string;
  purpose: string;
  vision: string;
  impact: string;
  firstLadyMessage: string;
} | null | undefined;

function AboutPageContent({ about }: { about: AboutData }) {
  return (
    <>
      <Section
        dark
        subtitle="Our Story"
        title="About The Homecoming Convention"
        className="pt-24"
      >
        <div className="mx-auto max-w-5xl space-y-10 text-lg leading-relaxed text-white md:text-xl md:leading-relaxed [&_p]:text-white">
          <p>{about?.history ?? "Content loading..."}</p>
          <Separator className="bg-white/20" />
          <div>
            <h3 className="font-display text-3xl font-normal text-gold md:text-4xl">
              Purpose
            </h3>
            <p className="mt-4">{about?.purpose}</p>
          </div>
          <Separator className="bg-white/20" />
          <div>
            <h3 className="font-display text-3xl font-normal text-gold md:text-4xl">
              Vision
            </h3>
            <p className="mt-4">{about?.vision}</p>
          </div>
          <Separator className="bg-white/20" />
          <div>
            <h3 className="font-display text-3xl font-normal text-gold md:text-4xl">
              Expected Impact
            </h3>
            <p className="mt-4">{about?.impact}</p>
          </div>
        </div>
      </Section>

      <Section className="bg-cream" subtitle="A Word of Welcome" title="From the First Lady">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <Card className="overflow-hidden border-0 pt-0 shadow-none ring-0">
            <AspectRatio ratio={4 / 3}>
              <Image
                src="https://picsum.photos/seed/homecoming-welcome/800/600"
                alt="Past Homecoming Convention gathering"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </AspectRatio>
          </Card>
          <div>
            <p className="lead border-l-2 border-gold pl-6 text-xl not-italic md:text-2xl">
              &ldquo;{about?.firstLadyMessage ?? "Welcome message coming soon."}&rdquo;
            </p>
          </div>
        </div>
      </Section>

      <Section dark subtitle="Join Us" title="Ready to Join Us?">
        <p className="lead lead-light mx-auto mb-10 max-w-3xl text-center text-xl md:text-2xl">
          Register for the convention and secure your accommodation today.
        </p>
        <div className="flex flex-wrap justify-center gap-5">
          <Button
            href="/registration"
            className="min-h-12 border-gold-light bg-gradient-to-r from-gold-light via-[#f0e6c8] to-gold px-9 py-4 text-base text-ink shadow-elevate hover:from-gold hover:via-gold-light hover:to-gold-dark hover:text-ink sm:min-h-[3.25rem] sm:px-10 sm:text-lg"
          >
            Register Now
          </Button>
          <Button
            href="/accommodation"
            variant="outline"
            className="min-h-12 border-2 border-gold bg-transparent px-9 py-4 text-base text-paper hover:border-gold-light hover:bg-gold/10 hover:text-paper sm:min-h-[3.25rem] sm:px-10 sm:text-lg"
          >
            Book Accommodation
          </Button>
        </div>
      </Section>
    </>
  );
}

function AboutPageConnected() {
  const about = useQuery(api.content.getAbout);
  return <AboutPageContent about={about} />;
}

export default function AboutPage() {
  if (!isConvexConfigured()) {
    return <AboutPageContent about={null} />;
  }
  return <AboutPageConnected />;
}
