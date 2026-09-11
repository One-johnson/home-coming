"use client";

import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "@convex/_generated/api";
import { LinkButton as Button } from "@/components/ui/app-button";
import { CountdownTimer } from "@/components/landing/CountdownTimer";
import { HeroCarousel } from "@/components/landing/HeroCarousel";
import { isConvexConfigured } from "@/lib/convex-config";
import { EVENT, SITE_FEATURES } from "@/lib/eventConfig";
import { homeContent } from "@/lib/siteContent";
import {
  fadeUp,
  reducedMotionContainer,
  reducedMotionItem,
  staggerContainer,
} from "@/lib/motion";

function HeroConnected() {
  const slides = useQuery(api.heroSlides.list);
  const fallback = homeContent.hero.slides;
  const resolved =
    slides && slides.length > 0
      ? slides
          .filter((slide) => Boolean(slide.imageUrl))
          .map((slide) => ({
            id: slide._id,
            src: slide.imageUrl,
            alt: slide.alt,
          }))
      : fallback.map((slide, index) => ({
          id: `fallback-${index}`,
          src: slide.src,
          alt: slide.alt,
        }));

  return <HeroContent slides={resolved} />;
}

function HeroContent({
  slides,
}: {
  slides: Array<{ id: string; src: string; alt: string }>;
}) {
  const { hero } = homeContent;
  const shouldReduceMotion = useReducedMotion();
  const containerVariants = shouldReduceMotion
    ? reducedMotionContainer
    : staggerContainer;
  const itemVariants = shouldReduceMotion ? reducedMotionItem : fadeUp;

  return (
    <section className="relative flex min-h-[92vh] flex-col overflow-hidden">
      <HeroCarousel slides={slides} autoplayDelay={6000} />

      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/55 via-[#1a1a1a]/40 to-[#0a0a0a]/75" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/80 via-[#0a0a0a]/35 to-transparent md:from-[#0a0a0a]/75 md:via-[#0a0a0a]/25" />

      <motion.div
        className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-28 sm:px-6 lg:px-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="w-full max-w-2xl md:max-w-[52%] lg:max-w-[48%] xl:max-w-[44%]">
          <motion.p
            className="eyebrow eyebrow-light mb-5"
            variants={itemVariants}
          >
            {EVENT.dates} · {EVENT.location}
          </motion.p>

          <motion.h1
            className="font-display text-5xl font-bold leading-[1.02] text-paper drop-shadow-[0_2px_20px_rgba(0,0,0,0.35)] sm:text-6xl md:text-7xl lg:text-8xl"
            variants={itemVariants}
          >
            <span className="text-gold-gradient">{hero.title}</span>
          </motion.h1>

          <motion.p
            className="lead lead-light mt-6 max-w-md font-bold not-italic"
            variants={itemVariants}
          >
            {hero.tagline}
          </motion.p>

          <motion.div
            className="mt-10 flex flex-row flex-nowrap items-center gap-3 sm:gap-4"
            variants={itemVariants}
          >
            <Button
              href="/registration"
              className="min-h-12 shrink-0 border-gold-light bg-gradient-to-r from-gold-light via-[#f0e6c8] to-gold px-5 py-3.5 text-sm font-bold text-ink shadow-elevate hover:from-gold hover:via-gold-light hover:to-gold-dark hover:text-ink sm:px-8 sm:text-base"
            >
              {hero.registerLabel}
            </Button>
            {SITE_FEATURES.accommodationEnabled ? (
              <Button
                href="/accommodation"
                variant="outline"
                className="min-h-12 shrink-0 border-2 border-paper/80 bg-white/10 px-5 py-3.5 text-sm font-bold text-paper backdrop-blur-md hover:border-gold-light hover:bg-paper hover:text-ink sm:px-8 sm:text-base"
              >
                {hero.accommodationLabel}
              </Button>
            ) : (
              <Button
                href="/tours"
                variant="outline"
                className="min-h-12 shrink-0 border-2 border-paper/80 bg-white/10 px-5 py-3.5 text-sm font-bold text-paper backdrop-blur-md hover:border-gold-light hover:bg-paper hover:text-ink sm:px-8 sm:text-base"
              >
                View Tours
              </Button>
            )}
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        className="relative z-10 border-t border-gold/30 bg-[#2a2a2a]"
        variants={itemVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 sm:px-6 md:flex-row md:gap-6 lg:px-8 lg:py-5">
          <p className="font-body text-xs font-bold tracking-[0.22em] text-gold-light uppercase sm:text-sm">
            {hero.countdownLabel}
          </p>
          <CountdownTimer compact />
        </div>
      </motion.div>
    </section>
  );
}

export function Hero() {
  if (!isConvexConfigured()) {
    return (
      <HeroContent
        slides={homeContent.hero.slides.map((slide, index) => ({
          id: `fallback-${index}`,
          src: slide.src,
          alt: slide.alt,
        }))}
      />
    );
  }

  return <HeroConnected />;
}
