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
    <section className="relative min-h-[92vh] overflow-hidden">
      <HeroCarousel slides={HERO_IMAGES} autoplayDelay={6000} />

      {/* Layered atmosphere: tonal wash, depth, cinematic vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/70 via-[#1a1a1a]/75 to-[#0a0a0a]/92" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/70 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_180px_60px_rgba(10,10,10,0.65)]" />

      <motion.div
        className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col justify-center px-4 py-28 sm:px-6 lg:px-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          className="mb-7 inline-flex w-fit items-center gap-3 rounded-full border border-gold-light/40 bg-white/5 px-4 py-1.5 backdrop-blur-md"
          variants={itemVariants}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-gold-light" aria-hidden />
          <p className="eyebrow eyebrow-light mb-0">
            {EVENT.dates} · {EVENT.location}
          </p>
        </motion.div>

        <motion.h1
          className="font-display max-w-4xl text-5xl font-light leading-[1.02] text-paper drop-shadow-[0_2px_20px_rgba(0,0,0,0.35)] md:text-7xl lg:text-8xl"
          variants={itemVariants}
        >
          {EVENT.name}
          <motion.span
            className="mt-4 block font-display text-3xl font-normal italic text-gold-gradient md:text-5xl"
            variants={itemVariants}
          >
            {EVENT.subtitle}
          </motion.span>
        </motion.h1>

        <motion.p className="lead lead-light mt-7 max-w-2xl" variants={itemVariants}>
          A global gathering at {EVENT.venue}, {EVENT.location}. Join believers
          from around the world with host and speaker {EVENT.host}.
        </motion.p>

        <motion.div
          className="mt-10 flex flex-wrap gap-4"
          variants={itemVariants}
        >
          <Button
            href="/registration"
            className="min-h-12 border-gold-light bg-gradient-to-r from-gold-light via-[#f0e6c8] to-gold px-10 py-3.5 text-base text-ink shadow-elevate hover:from-gold hover:via-gold-light hover:to-gold-dark hover:text-ink sm:px-12"
          >
            Register Now
          </Button>
          <Button
            href="/accommodation"
            variant="outline"
            className="min-h-12 border-2 border-paper/80 bg-white/10 px-10 py-3.5 text-base text-paper backdrop-blur-md hover:border-gold-light hover:bg-paper hover:text-ink sm:px-12"
          >
            Book Accommodation
          </Button>
        </motion.div>

        <motion.div className="mt-14 max-w-2xl" variants={itemVariants}>
          <p className="eyebrow eyebrow-light mb-4">
            Countdown to Opening Day
          </p>
          <CountdownTimer />
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute inset-x-0 bottom-6 z-10 flex justify-center"
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        aria-hidden
      >
        <span className="flex h-9 w-5 items-start justify-center rounded-full border border-white/40 p-1.5">
          <span className="animate-scroll-cue h-2 w-1 rounded-full bg-gold-light" />
        </span>
      </motion.div>
    </section>
  );
}
