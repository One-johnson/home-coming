"use client";

import Image from "next/image";
import { BookOpen, Clock, Flower2, Landmark, type LucideIcon } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionReveal, MotionStagger } from "@/components/ui/motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { EVENT } from "@/lib/eventConfig";
import { homeContent } from "@/lib/siteContent";

const VENUE_ICONS: Record<string, LucideIcon> = {
  Landmark,
  BookOpen,
  Flower2,
  Clock,
};

export function VenueSection() {
  const { venue } = homeContent;
  const intro = venue.intro.replace("{location}", EVENT.location);

  return (
    <Section id={venue.id} subtitle={venue.subtitle} title={venue.title} dark>
      <MotionReveal className="relative -mx-4 mb-14 overflow-hidden rounded-2xl shadow-elevate ring-1 ring-white/10 sm:-mx-6 lg:-mx-8 lg:rounded-3xl">
        <div className="grid grid-cols-1 gap-1 bg-black/40 sm:grid-cols-3 sm:gap-1.5">
          {venue.photos.map((photo, index) => (
            <div
              key={photo.src}
              className="group relative aspect-[4/5] overflow-hidden sm:aspect-[3/4]"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, 33vw"
                priority={index < 2}
              />
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 bg-black/25 px-6 py-8 sm:px-10 sm:py-10">
          <p className="eyebrow eyebrow-light mb-3 text-center">
            {venue.captionEyebrow}
          </p>
          <p className="font-display mx-auto max-w-3xl text-center text-2xl font-normal italic leading-snug text-paper sm:text-3xl lg:text-4xl">
            {venue.caption}
          </p>
        </div>
      </MotionReveal>

      <MotionReveal className="mx-auto max-w-3xl text-center">
        <p className="lead lead-light">{intro}</p>
      </MotionReveal>

      <MotionStagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {venue.highlights.map((item) => {
          const Icon = VENUE_ICONS[item.icon] ?? Landmark;
          return (
            <MotionItem key={item.title}>
              <div className="card-lift h-full rounded-2xl border border-white/10 bg-white/5 p-5 text-center ring-1 ring-white/10 transition-colors hover:border-gold-light/40 hover:bg-white/[0.08]">
                <span className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 ring-1 ring-gold-light/30">
                  <Icon className="h-5 w-5 text-gold-light" aria-hidden />
                </span>
                <h3 className="font-display text-lg text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">
                  {item.description}
                </p>
              </div>
            </MotionItem>
          );
        })}
      </MotionStagger>

      <MotionReveal className="mx-auto mt-12 max-w-3xl space-y-5 text-center">
        {venue.details.map((paragraph) => (
          <p
            key={paragraph.slice(0, 48)}
            className="text-base leading-relaxed text-white/85 sm:text-lg"
          >
            {paragraph}
          </p>
        ))}
      </MotionReveal>

      <MotionReveal className="mt-12 flex justify-center">
        <Button
          href={EVENT.venueUrl}
          external
          variant="outline"
          className="border-white/70 bg-white/5 text-paper backdrop-blur-md hover:bg-paper hover:text-primary"
        >
          {venue.exploreLabel}
        </Button>
      </MotionReveal>
    </Section>
  );
}
