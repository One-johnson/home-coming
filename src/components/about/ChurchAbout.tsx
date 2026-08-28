"use client";

import {
  BookOpen,
  Church,
  Globe,
  GraduationCap,
  Heart,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { aboutContent } from "@/lib/siteContent";

const ICONS: Record<string, LucideIcon> = {
  Church,
  Sparkles,
  BookOpen,
  Globe,
  GraduationCap,
  Heart,
};

export function ChurchAbout() {
  const { church } = aboutContent;
  const shouldReduceMotion = useReducedMotion();

  return (
    <Section
      id="church"
      className="scroll-mt-32 bg-cream"
      subtitle={church.subtitle}
      title={church.title}
    >
      <p className="lead mx-auto mb-12 max-w-3xl text-center">{church.intro}</p>

      <MotionStagger className="grid gap-6 lg:grid-cols-3">
        {church.pillars.map((pillar) => {
          const Icon = ICONS[pillar.icon] ?? Church;
          return (
            <MotionItem key={pillar.heading} className="h-full">
              <motion.div
                className="h-full"
                whileHover={shouldReduceMotion ? undefined : { y: -6 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card className="h-full border-0 bg-white/80 py-6 shadow-soft ring-1 ring-border">
                  <CardHeader>
                    <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/25">
                      <Icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <CardTitle className="font-display text-2xl font-normal text-gold-dark md:text-3xl">
                      {pillar.heading}
                    </CardTitle>
                    <CardDescription className="mt-2 text-base leading-relaxed text-soft-ink">
                      {pillar.summary}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {pillar.items.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-soft-ink md:text-base">
                          <span
                            className="mt-2 size-1.5 shrink-0 rotate-45 bg-gold"
                            aria-hidden
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            </MotionItem>
          );
        })}
      </MotionStagger>

      <h3 className="mt-16 mb-8 text-center font-display text-3xl font-normal text-foreground md:text-4xl">
        {church.serveTitle}
      </h3>

      <MotionStagger className="grid gap-6 md:grid-cols-3">
        {church.serve.map((item) => {
          const Icon = ICONS[item.icon] ?? Heart;
          return (
            <MotionItem key={item.heading} className="h-full">
              <motion.div
                className="h-full"
                whileHover={shouldReduceMotion ? undefined : { y: -6 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card className="h-full border-0 bg-white/70 py-6 shadow-soft ring-1 ring-border">
                  <CardHeader>
                    <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/25">
                      <Icon className="h-5 w-5 text-accent" aria-hidden />
                    </span>
                    <CardTitle className="font-display text-xl font-normal">
                      {item.heading}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="leading-relaxed text-soft-ink">{item.body}</p>
                  </CardContent>
                </Card>
              </motion.div>
            </MotionItem>
          );
        })}
      </MotionStagger>

      <p className="mx-auto mt-12 max-w-3xl text-center text-base leading-relaxed text-stone md:text-lg">
        {church.connection}
      </p>
    </Section>
  );
}
