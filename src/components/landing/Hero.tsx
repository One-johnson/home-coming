"use client";

import { motion, useReducedMotion } from "framer-motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { CountdownTimer } from "@/components/landing/CountdownTimer";
import {
  HeroCarousel,
  type HeroSlide,
} from "@/components/landing/HeroCarousel";
import { EVENT } from "@/lib/eventConfig";
import {
  fadeUp,
  reducedMotionContainer,
  reducedMotionItem,
  staggerContainer,
} from "@/lib/motion";

const HERO_IMAGES: HeroSlide[] = [
  {
    src: "/hero/banner.jpeg",
    alt: "Mountain of the Lord — The Homecoming event banner at Anagkazo Campus",
  },
  {
    src: "/hero/slide-01.jpg",
    alt: "Worship gathering at a past Homecoming Convention",
  },
  {
    src: "/hero/slide-02.jpg",
    alt: "Crowds gathered at Anagkazo Campus",
  },
  {
    src: "/hero/slide-03.jpg",
    alt: "Ministers worshipping at The Homecoming",
  },
  {
    src: "/hero/slide-04.jpg",
    alt: "Convention session at Anagkazo Campus",
  },
  {
    src: "/hero/slide-05.jpg",
    alt: "Believers gathered on the mountain for The Homecoming",
  },
];

export function Hero() {
  const shouldReduceMotion = useReducedMotion();
  const containerVariants = shouldReduceMotion
    ? reducedMotionContainer
    : staggerContainer;
  const itemVariants = shouldReduceMotion ? reducedMotionItem : fadeUp;

  return (
    <section className="relative flex min-h-[92vh] flex-col overflow-hidden">
      <HeroCarousel slides={HERO_IMAGES} autoplayDelay={6000} />

      {/* Overlays: a bit darker for text contrast, photos still read on the right */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-[#1a1a1a]/55 to-[#0a0a0a]/80" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/85 via-[#0a0a0a]/45 to-transparent md:from-[#0a0a0a]/80 md:via-[#0a0a0a]/30" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_160px_52px_rgba(10,10,10,0.5)]" />

      <motion.div
        className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-28 sm:px-6 lg:px-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="w-full max-w-2xl md:max-w-[52%] lg:max-w-[48%] xl:max-w-[44%]">
          <motion.div
            className="mb-7 inline-flex w-fit items-center gap-3 rounded-full border border-gold-light/40 bg-white/5 px-4 py-1.5 backdrop-blur-md"
            variants={itemVariants}
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-gold-light"
              aria-hidden
            />
            <p className="eyebrow eyebrow-light mb-0 font-bold">
              {EVENT.dates} · {EVENT.location}
            </p>
          </motion.div>

          <motion.h1
            className="font-display text-3xl font-bold leading-[1.02] drop-shadow-[0_2px_20px_rgba(0,0,0,0.35)] sm:text-6xl md:text-7xl lg:text-6xl"
            variants={itemVariants}
          >
            <span className="text-gold-gradient">Mountain of the Lord</span>
            <span className="mt-3 block text-paper sm:mt-4">
              The Homecoming
            </span>
          </motion.h1>

          <motion.p
            className="lead lead-light mt-6 font-bold not-italic"
            variants={itemVariants}
          >
            A gathering of all the churches — everyone is coming home! Be part
            of this historic event.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-row flex-nowrap items-center gap-3 sm:gap-4"
            variants={itemVariants}
          >
            <Button
              href="/registration"
              className="min-h-12 shrink-0 border-gold-light bg-gradient-to-r from-gold-light via-[#f0e6c8] to-gold px-5 py-3.5 text-sm font-bold text-ink shadow-elevate hover:from-gold hover:via-gold-light hover:to-gold-dark hover:text-ink sm:px-8 sm:text-base"
            >
              Register Now
            </Button>
            <Button
              href="/accommodation"
              variant="outline"
              className="min-h-12 shrink-0 border-2 border-paper/80 bg-white/10 px-5 py-3.5 text-sm font-bold text-paper backdrop-blur-md hover:border-gold-light hover:bg-paper hover:text-ink sm:px-8 sm:text-base"
            >
              Book Accommodation
            </Button>
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
            Countdown to Homecoming 2026
          </p>

          <CountdownTimer compact />
        </div>
      </motion.div>
    </section>
  );
}
