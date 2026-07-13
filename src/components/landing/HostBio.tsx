"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { MotionReveal } from "@/components/ui/motion";
import { TypewriterSequence } from "@/components/ui/typewriter-on-view";
import { HOST_CTA_LINKS } from "@/lib/eventConfig";

const HOST_BIO = [
  "Dag Heward-Mills is a world renowned healing evangelist, megachurch pastor, best-selling author, and international conference speaker. Born in Ghana, he has dedicated his life to bringing the Gospel — and the miraculous power of God — to the nations.",
  "He is the founder of the Healing Jesus Campaign — a mass healing evangelism initiative that has reached millions across more than 41 countries worldwide, with 275 campaigns, 812 campaign nights, and over 25.3 million souls won for Christ in 21 years.",
  "He is also the founder and General Overseer of the United Denominations Originating from the Lighthouse Group of Churches (UD-OLGC) — a global network of churches spanning multiple continents.",
  "A prolific author, Dag Heward-Mills has written and published over 70 million books in multiple languages, covering every major ministry topic. His works have transformed millions of lives across more than 50 countries and are available in print, digital, and audio formats.",
  "He is the founder of the Anagkazo Bible School — one of the leading Bible training institutions in the world — and First Love Music, a music ministry producing anointed Christian worship.",
  "As an international conference speaker, he has addressed audiences across Africa, Asia, Europe, the Americas, and the Pacific Islands — calling the Body of Christ to a deeper walk with God, genuine faith, and apostolic ministry.",
] as const;

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
        paragraphs={HOST_BIO}
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
