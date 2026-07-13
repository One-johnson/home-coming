"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  fadeUp,
  reducedMotionContainer,
  reducedMotionItem,
  scrollViewport,
  staggerGrid,
} from "@/lib/motion";

type MotionProps = {
  children: React.ReactNode;
  className?: string;
};

export function MotionReveal({ children, className }: MotionProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={scrollViewport}
    >
      {children}
    </motion.div>
  );
}

export function MotionStagger({ children, className }: MotionProps) {
  const shouldReduceMotion = useReducedMotion();
  const container = shouldReduceMotion ? reducedMotionContainer : staggerGrid;

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn(className)}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={scrollViewport}
    >
      {children}
    </motion.div>
  );
}

export function MotionItem({ children, className }: MotionProps) {
  const shouldReduceMotion = useReducedMotion();
  const item = shouldReduceMotion ? reducedMotionItem : fadeUp;

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
