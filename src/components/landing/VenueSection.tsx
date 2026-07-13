"use client";

import Image from "next/image";
import { BookOpen, Clock, Flower2, Landmark } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionReveal, MotionStagger } from "@/components/ui/motion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { EVENT } from "@/lib/eventConfig";

const CAMPUS_PHOTOS = [
  {
    src: "/campus/anagkazo.jpg",
    alt: "Main entrance to Anagkazo Bible School Campus",
  },
  {
    src: "/campus/campus.jpg",
    alt: "Monument of books at Revelation Roundabout on campus",
  },
  {
    src: "/campus/campus1.jpg",
    alt: "Lighthouse overlooking the Akwapim Mountains from Anagkazo Campus",
  },
] as const;

const VENUE_HIGHLIGHTS = [
  {
    icon: Landmark,
    title: "Conference Halls",
    description: "Unique architecture built for gathering and impartation",
  },
  {
    icon: BookOpen,
    title: "Library of the Anointing",
    description: "A renowned space for study, prayer, and encounter",
  },
  {
    icon: Flower2,
    title: "100% Answered Prayer Garden",
    description: "Quiet grounds designed for reflection and devotion",
  },
  {
    icon: Clock,
    title: "Tours & Access",
    description: "Explore the campus by cart or train — about an hour from Accra",
  },
] as const;

export function VenueSection() {
  return (
    <Section
      id="venue"
      subtitle="The Venue"
      title="Anagkazo Campus, Mampong"
      dark
    >
      <MotionReveal className="relative -mx-4 mb-14 overflow-hidden rounded-2xl shadow-elevate ring-1 ring-white/10 sm:-mx-6 lg:-mx-8 lg:rounded-3xl">
        <div className="grid grid-cols-1 gap-1 bg-black/40 sm:grid-cols-3 sm:gap-1.5">
          {CAMPUS_PHOTOS.map((photo, index) => (
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
            Anagkazo Bible School Campus
          </p>
          <p className="font-display mx-auto max-w-3xl text-center text-2xl font-normal italic leading-snug text-paper sm:text-3xl lg:text-4xl">
            A place shaped by purpose, surrounded by nature.
          </p>
        </div>
      </MotionReveal>

      <MotionReveal className="mx-auto max-w-3xl text-center">
        <p className="lead lead-light">
          Nestled in the heart of the Akwapim Mountains in {EVENT.location}, the
          Anagkazo Bible School Campus is a breathtaking setting of gardens,
          halls, and panoramic views — purpose-built for prayer, reflection, and
          gathering.
        </p>
      </MotionReveal>

      <MotionStagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {VENUE_HIGHLIGHTS.map((item) => (
          <MotionItem key={item.title}>
            <div className="card-lift h-full rounded-2xl border border-white/10 bg-white/5 p-5 text-center ring-1 ring-white/10 transition-colors hover:border-gold-light/40 hover:bg-white/[0.08]">
              <span className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 ring-1 ring-gold-light/30">
                <item.icon className="h-5 w-5 text-gold-light" aria-hidden />
              </span>
              <h3 className="font-display text-lg text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                {item.description}
              </p>
            </div>
          </MotionItem>
        ))}
      </MotionStagger>

      <MotionReveal className="mx-auto mt-12 max-w-3xl space-y-5 text-center">
        <p className="text-base leading-relaxed text-white/85 sm:text-lg">
          The campus features unique architecture, conference halls, the renowned
          Library of the Anointing, the 100% Answered Prayer Garden, and quiet
          spaces designed for reflection. Tours are available by cart or by train.
        </p>
        <p className="text-base leading-relaxed text-white/85 sm:text-lg">
          Just an hour from Accra, it is the long-time home of the Give Thyself
          Wholly Conference — and every space has been thoughtfully prepared to
          welcome ministers from around the world.
        </p>
      </MotionReveal>

      <MotionReveal className="mt-12 flex justify-center">
        <Button
          href={EVENT.venueUrl}
          external
          variant="outline"
          className="border-white/70 bg-white/5 text-paper backdrop-blur-md hover:bg-paper hover:text-primary"
        >
          Explore More
        </Button>
      </MotionReveal>
    </Section>
  );
}
