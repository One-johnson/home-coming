"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
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
    </section>
  );
}
