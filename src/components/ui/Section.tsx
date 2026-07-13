"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  fadeUp,
  reducedMotionItem,
  scrollViewport,
  staggerContainer,
} from "@/lib/motion";

interface SectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}

export function Section({
  id,
  title,
  subtitle,
  children,
  className,
  dark,
}: SectionProps) {
  const shouldReduceMotion = useReducedMotion();
  const itemVariants = shouldReduceMotion ? reducedMotionItem : fadeUp;
  const containerVariants = shouldReduceMotion
    ? { hidden: {}, visible: {} }
    : staggerContainer;

  return (
    <section
      id={id}
      className={cn(
        "relative overflow-hidden py-20 md:py-28",
        dark ? "bg-section-dark text-white" : "bg-background",
        className,
      )}
    >
      {dark ? (
        <div
          className="bg-dots pointer-events-none absolute inset-0 opacity-[0.12]"
          aria-hidden
        />
      ) : (
        <div
          className="glow-warm pointer-events-none absolute inset-0"
          aria-hidden
        />
      )}

      <motion.div
        className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={scrollViewport}
      >
        {(title || subtitle) && (
          <motion.div
            className="mx-auto mb-14 max-w-2xl text-center"
            variants={itemVariants}
          >
            {subtitle && (
              <p className={cn("eyebrow mb-4", dark && "eyebrow-light")}>
                {subtitle}
              </p>
            )}
            {title && (
              <h2
                className={cn(
                  "font-display text-4xl font-normal leading-[1.1] tracking-tight md:text-5xl",
                  dark ? "text-white" : "text-foreground",
                )}
              >
                {title}
              </h2>
            )}
            <div
              className={cn(
                "ornament mt-6",
                dark && "ornament-light",
              )}
              aria-hidden
            >
              <span className="ornament-diamond" />
            </div>
          </motion.div>
        )}
        <motion.div variants={itemVariants}>{children}</motion.div>
      </motion.div>
    </section>
  );
}
