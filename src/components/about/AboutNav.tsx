"use client";

import { useEffect, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { aboutContent } from "@/lib/siteContent";
import { cn } from "@/lib/utils";

export function AboutNav() {
  const { nav } = aboutContent;
  const shouldReduceMotion = useReducedMotion();
  const [active, setActive] = useState(nav[0]?.id ?? "church");

  useEffect(() => {
    const sections = nav
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-35% 0px -50% 0px", threshold: [0.1, 0.25, 0.5] },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [nav]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-[4.35rem] z-40 border-b border-border/70 bg-background/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-4 py-2.5 sm:gap-2 sm:px-6 lg:px-8">
        <LayoutGroup>
          {nav.map((item) => {
            const isActive = active === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-semibold tracking-wide transition-colors",
                  isActive ? "text-ink" : "text-stone hover:text-foreground",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(item.id)?.scrollIntoView({
                    behavior: shouldReduceMotion ? "auto" : "smooth",
                    block: "start",
                  });
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId={shouldReduceMotion ? undefined : "about-nav-pill"}
                    className="absolute inset-0 rounded-full bg-gold/20 ring-1 ring-gold/30"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </a>
            );
          })}
        </LayoutGroup>
      </div>
    </nav>
  );
}
