"use client";

import Image from "next/image";
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Section } from "@/components/ui/Section";
import { aboutContent } from "@/lib/siteContent";
import { fadeUp, gentleTransition, scrollViewport } from "@/lib/motion";

function splitLetter(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) =>
      part.includes("\n")
        ? part
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : [part],
    );
}

export function FirstLadyWelcome() {
  const { firstLady } = aboutContent;
  const shouldReduceMotion = useReducedMotion();
  const paragraphs = useMemo(
    () => splitLetter(firstLady.message),
    [firstLady.message],
  );

  const body = paragraphs.slice(0, -1);
  const signature = paragraphs.at(-1) ?? firstLady.name;

  return (
    <Section
      id="welcome"
      className="scroll-mt-32 bg-cream"
      subtitle={firstLady.subtitle}
      title={firstLady.title}
    >
      <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] lg:gap-14">
        <motion.div
          className="lg:sticky lg:top-36"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 28 }}
          whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={scrollViewport}
          transition={gentleTransition}
        >
          <div className="overflow-hidden rounded-2xl shadow-elevate ring-1 ring-border">
            <div className="relative aspect-[4/5]">
              <motion.div
                className="absolute inset-0"
                whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <Image
                  src={firstLady.image}
                  alt={firstLady.imageAlt}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                />
              </motion.div>
            </div>
          </div>
          <div className="mt-5 text-center lg:text-left">
            <p className="font-display text-2xl text-foreground">
              {firstLady.name}
            </p>
            <p className="mt-1 text-sm font-semibold tracking-[0.2em] text-gold-dark uppercase">
              {firstLady.role}
            </p>
          </div>
        </motion.div>

        <motion.div
          className="border-l-2 border-gold pl-6 sm:pl-8"
          variants={
            shouldReduceMotion
              ? undefined
              : {
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.06 } },
                }
          }
          initial="hidden"
          whileInView="visible"
          viewport={scrollViewport}
        >
          {body.map((paragraph) => (
            <motion.p
              key={paragraph.slice(0, 40)}
              className="mb-5 text-base leading-relaxed text-soft-ink md:text-lg"
              variants={shouldReduceMotion ? undefined : fadeUp}
            >
              {paragraph}
            </motion.p>
          ))}
          <motion.p
            className="mt-8 font-display text-xl italic text-foreground"
            variants={shouldReduceMotion ? undefined : fadeUp}
          >
            {signature}
          </motion.p>
        </motion.div>
      </div>
    </Section>
  );
}
