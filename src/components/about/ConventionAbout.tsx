"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { aboutContent } from "@/lib/siteContent";

export function ConventionAbout() {
  const { convention } = aboutContent;
  const shouldReduceMotion = useReducedMotion();

  return (
    <Section
      id="convention"
      dark
      className="scroll-mt-32"
      subtitle={convention.subtitle}
      title={convention.title}
    >
      <p className="lead lead-light mx-auto mb-12 max-w-3xl text-center">
        {convention.history}
      </p>

      <MotionStagger className="grid gap-6 md:grid-cols-3">
        {convention.cards.map((card) => (
          <MotionItem key={card.heading} className="h-full">
            <motion.div
              className="h-full"
              whileHover={shouldReduceMotion ? undefined : { y: -6 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="h-full border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] py-6 text-white ring-1 ring-white/10">
                <CardHeader>
                  <CardTitle className="font-display text-2xl font-normal text-gold md:text-3xl">
                    {card.heading}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="leading-relaxed text-white/85">{card.body}</p>
                </CardContent>
              </Card>
            </motion.div>
          </MotionItem>
        ))}
      </MotionStagger>

      <MotionStagger className="mt-12 grid gap-3 sm:grid-cols-3">
        {convention.photos.map((photo) => (
          <MotionItem key={photo.src}>
            <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl ring-1 ring-white/10 sm:aspect-[3/4]">
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, 33vw"
              />
            </div>
          </MotionItem>
        ))}
      </MotionStagger>
    </Section>
  );
}
