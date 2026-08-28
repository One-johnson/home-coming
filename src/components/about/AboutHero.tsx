"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { EVENT } from "@/lib/eventConfig";
import { aboutContent } from "@/lib/siteContent";
import {
  fadeUp,
  reducedMotionContainer,
  reducedMotionItem,
  staggerContainer,
} from "@/lib/motion";

export function AboutHero() {
  const { hero } = aboutContent;
  const shouldReduceMotion = useReducedMotion();
  const container = shouldReduceMotion
    ? reducedMotionContainer
    : staggerContainer;
  const item = shouldReduceMotion ? reducedMotionItem : fadeUp;

  return (
    <section>
      <div className="relative h-[56vh] min-h-[360px] max-h-[560px] overflow-hidden md:h-[62vh] md:max-h-[680px]">
        <motion.div
          className="absolute inset-0"
          initial={shouldReduceMotion ? false : { scale: 1.08 }}
          animate={shouldReduceMotion ? undefined : { scale: 1 }}
          transition={{ duration: 12, ease: "linear" }}
        >
          <Image
            src={hero.image}
            alt={hero.imageAlt}
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
        </motion.div>

        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/80 via-[#0a0a0a]/25 to-[#0a0a0a]/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/55 via-transparent to-transparent" />

        <motion.div
          className="relative z-10 flex h-full items-end px-4 pb-8 sm:px-6 sm:pb-10 lg:px-8"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          <div className="mx-auto w-full max-w-7xl">
            <motion.p
              className="eyebrow eyebrow-light mb-3"
              variants={item}
            >
              The Homecoming · {EVENT.dates}
            </motion.p>
            <motion.h1
              className="font-display text-3xl font-bold leading-[1.08] text-paper drop-shadow-[0_2px_16px_rgba(0,0,0,0.45)] sm:text-4xl md:text-5xl"
              variants={item}
            >
              {hero.bannerTitle}
            </motion.h1>
            <motion.p
              className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-paper/90 sm:text-base md:text-lg"
              variants={item}
            >
              {hero.bannerSubtitle}
            </motion.p>
          </div>
        </motion.div>
      </div>

      <div className="relative overflow-hidden bg-cream">
        <div className="glow-warm pointer-events-none absolute inset-0" aria-hidden />
        <motion.div
          className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20 lg:px-8"
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
        >
          <div className="mx-auto max-w-3xl text-center">
            <motion.p className="eyebrow mb-4" variants={item}>
              {hero.eyebrow}
            </motion.p>
            <motion.h2
              className="font-display text-4xl font-normal leading-[1.1] tracking-tight text-foreground md:text-5xl"
              variants={item}
            >
              {hero.title}
            </motion.h2>
            <div className="ornament mt-6" aria-hidden>
              <span className="ornament-diamond" />
            </div>
            <motion.p
              className="lead mx-auto mt-8 max-w-2xl not-italic"
              variants={item}
            >
              {hero.tagline}
            </motion.p>
            <motion.p
              className="mt-3 text-sm font-medium tracking-wide text-gold-dark sm:text-base"
              variants={item}
            >
              The Homecoming · {EVENT.dates} · {EVENT.location}
            </motion.p>
            <motion.blockquote
              className="mx-auto mt-8 max-w-xl border-l-2 border-gold pl-5 text-left font-display text-xl italic leading-snug text-foreground sm:text-2xl"
              variants={item}
            >
              {hero.quote}
            </motion.blockquote>
            <motion.div
              className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
              variants={item}
            >
              <Button
                href={hero.primaryCta.href}
                className="min-h-12 border-gold bg-gold px-6 py-3.5 text-sm font-bold text-ink shadow-elevate hover:bg-gold-dark hover:text-ink sm:px-8 sm:text-base"
              >
                {hero.primaryCta.label}
              </Button>
              <Button
                href={hero.secondaryCta.href}
                variant="outline"
                className="min-h-12 border-2 border-gold bg-transparent px-6 py-3.5 text-sm font-bold text-ink hover:bg-gold/10 hover:text-ink sm:px-8 sm:text-base"
              >
                {hero.secondaryCta.label}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
