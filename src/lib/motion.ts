import type { Transition, Variants } from "framer-motion";

export const gentleEase = [0.22, 1, 0.36, 1] as const;

export const gentleTransition: Transition = {
  duration: 0.8,
  ease: gentleEase,
};

export const scrollViewport = {
  once: true,
  margin: "-80px",
  amount: 0.15,
} as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: gentleTransition,
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6, ease: gentleEase },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

export const staggerGrid: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

export const reducedMotionContainer: Variants = {
  hidden: {},
  visible: {},
};

export const reducedMotionItem: Variants = {
  hidden: {},
  visible: {},
};

export const pageEnter: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: gentleEase },
  },
};
