"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { MotionReveal } from "@/components/ui/motion";
import { TypewriterSequence } from "@/components/ui/typewriter-on-view";
import { HOST_CTA_LINKS } from "@/lib/eventConfig";
import { homeContent } from "@/lib/siteContent";

export function HostBio() {
  const shouldReduceMotion = useReducedMotion();
  const [showCta, setShowCta] = useState(false);

  useEffect(() => {
    if (shouldReduceMotion) {
      setShowCta(true);
    }
  }, [shouldReduceMotion]);

  return (
    <div className="flex flex-1 flex-col justify-start">
      <TypewriterSequence
        paragraphs={homeContent.host.bio}
        speed={38}
        className="text-[0.98rem] font-medium leading-relaxed sm:text-base"
        onComplete={() => setShowCta(true)}
      />

      {showCta && (
        <MotionReveal className="mt-6">
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
      )}
    </div>
  );
}
