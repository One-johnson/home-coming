"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { MotionItem, MotionReveal, MotionStagger } from "@/components/ui/motion";
import { HOST_CTA_LINKS } from "@/lib/eventConfig";
import { homeContent } from "@/lib/siteContent";

function formatStatNumber(value: number, decimals: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function AnimatedStatValue({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const shouldReduceMotion = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 55, damping: 22 });
  const [display, setDisplay] = useState(
    shouldReduceMotion ? formatStatNumber(value, decimals) : formatStatNumber(0, decimals),
  );

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplay(formatStatNumber(value, decimals));
      return;
    }
    if (inView) {
      motionValue.set(value);
    }
  }, [decimals, inView, motionValue, shouldReduceMotion, value]);

  useEffect(() => {
    if (shouldReduceMotion) return;
    return spring.on("change", (latest) => {
      setDisplay(formatStatNumber(latest, decimals));
    });
  }, [decimals, shouldReduceMotion, spring]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

export function HostBio() {
  const { host } = homeContent;

  return (
    <div className="flex flex-col gap-8">
      <MotionStagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {host.stats.map((stat) => (
          <MotionItem key={stat.label}>
            <div className="h-full rounded-xl border border-border bg-background/70 px-4 py-5 text-center shadow-soft">
              <p className="text-gold-gradient font-display text-3xl font-normal md:text-4xl">
                <AnimatedStatValue
                  value={stat.value}
                  suffix={stat.suffix}
                />
              </p>
              <p className="mt-2 font-body text-[0.7rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase sm:text-xs">
                {stat.label}
              </p>
              {"detail" in stat && stat.detail ? (
                <p className="mt-1 font-body text-sm text-soft-ink">{stat.detail}</p>
              ) : null}
            </div>
          </MotionItem>
        ))}
      </MotionStagger>

      <MotionReveal>
        <div className="flex flex-wrap gap-3">
          {HOST_CTA_LINKS.map((link) => (
            <Button
              key={link.href}
              href={link.href}
              external
              variant="outline"
              className="border-2 border-gold bg-transparent text-ink hover:bg-gold/10 hover:text-ink"
            >
              {link.label}
            </Button>
          ))}
        </div>
      </MotionReveal>
    </div>
  );
}
