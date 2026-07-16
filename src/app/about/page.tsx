"use client";

import Image from "next/image";
import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "@convex/_generated/api";
import { ExpandableText } from "@/components/about/ExpandableText";
import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isConvexConfigured } from "@/lib/convex-config";
import { gentleTransition, scrollViewport } from "@/lib/motion";

type AboutData = {
  history: string;
  purpose: string;
  vision: string;
  impact: string;
  firstLadyMessage: string;
  firstLadyImageUrl?: string | null;
} | null | undefined;

const WELCOME_IMAGE_FALLBACK =
  "https://picsum.photos/seed/homecoming-welcome/800/600";

function WelcomeImage({ src }: { src: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="overflow-hidden"
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: 24 }}
      whileInView={
        shouldReduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }
      }
      viewport={scrollViewport}
      transition={gentleTransition}
    >
      <Card className="overflow-hidden border-0 pt-0 shadow-none ring-0">
        <AspectRatio ratio={4 / 3} className="overflow-hidden">
          <motion.div
            className="absolute inset-0"
            whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <Image
              src={src}
              alt="Word of Welcome from the First Lady"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </motion.div>
        </AspectRatio>
      </Card>
    </motion.div>
  );
}

function AboutPageContent({ about }: { about: AboutData }) {
  const welcomeImage = about?.firstLadyImageUrl || WELCOME_IMAGE_FALLBACK;

  return (
    <>
      <Section
        dark
        subtitle="Our Story"
        title="About The Homecoming Convention"
        className="pt-24"
      >
        <div className="mx-auto max-w-5xl space-y-10 text-lg leading-relaxed text-white md:text-xl md:leading-relaxed">
          <ExpandableText
            text={about?.history ?? "Content loading..."}
            previewChars={320}
            buttonClassName="text-gold"
          />
          <Separator className="bg-white/20" />
          <div>
            <h3 className="font-display text-3xl font-normal text-gold md:text-4xl">
              Purpose
            </h3>
            <ExpandableText
              className="mt-4"
              text={about?.purpose ?? ""}
              previewChars={240}
              buttonClassName="text-gold"
            />
          </div>
          <Separator className="bg-white/20" />
          <div>
            <h3 className="font-display text-3xl font-normal text-gold md:text-4xl">
              Vision
            </h3>
            <ExpandableText
              className="mt-4"
              text={about?.vision ?? ""}
              previewChars={240}
              buttonClassName="text-gold"
            />
          </div>
          <Separator className="bg-white/20" />
          <div>
            <h3 className="font-display text-3xl font-normal text-gold md:text-4xl">
              Expected Impact
            </h3>
            <ExpandableText
              className="mt-4"
              text={about?.impact ?? ""}
              previewChars={240}
              buttonClassName="text-gold"
            />
          </div>
        </div>
      </Section>

      <Section
        className="bg-cream"
        subtitle="A Word of Welcome"
        title="From the First Lady"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <WelcomeImage src={welcomeImage} />
          <ExpandableText
            text={about?.firstLadyMessage ?? "Welcome message coming soon."}
            previewChars={220}
            quoted
            wrapperClassName="border-l-2 border-gold pl-6"
            paragraphClassName="lead text-xl not-italic md:text-2xl"
            buttonClassName="text-gold-dark"
          />
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
