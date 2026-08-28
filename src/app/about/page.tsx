"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { ChurchAbout } from "@/components/about/ChurchAbout";
import { ExpandableText } from "@/components/about/ExpandableText";
import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { aboutContent } from "@/lib/siteContent";
import { gentleTransition, scrollViewport } from "@/lib/motion";

function WelcomeImage({ src, alt }: { src: string; alt: string }) {
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
              alt={alt}
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

export default function AboutPage() {
  const { convention, firstLady, cta } = aboutContent;

  return (
    <>
      <ChurchAbout />

      <Section dark subtitle={convention.subtitle} title={convention.title}>
        <div className="mx-auto max-w-5xl space-y-10 text-lg leading-relaxed text-white [&_p]:text-white md:text-xl md:leading-relaxed">
          <ExpandableText
            text={convention.history}
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
              text={convention.purpose}
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
              text={convention.vision}
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
              text={convention.impact}
              previewChars={240}
              buttonClassName="text-gold"
            />
          </div>
        </div>
      </Section>

      <Section
        className="bg-cream"
        subtitle={firstLady.subtitle}
        title={firstLady.title}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <WelcomeImage src={firstLady.image} alt={firstLady.imageAlt} />
          <ExpandableText
            text={firstLady.message}
            previewChars={220}
            quoted
            wrapperClassName="border-l-2 border-gold pl-6"
            paragraphClassName="lead text-xl not-italic md:text-2xl"
            buttonClassName="text-gold-dark"
          />
        </div>
      </Section>

      <Section dark subtitle={cta.subtitle} title={cta.title}>
        <p className="lead lead-light mx-auto mb-10 max-w-3xl text-center text-xl md:text-2xl">
          {cta.body}
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
