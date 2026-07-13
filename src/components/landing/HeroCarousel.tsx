"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import Fade from "embla-carousel-fade";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type HeroSlide = {
  src: string;
  alt: string;
};

type HeroCarouselProps = {
  slides: HeroSlide[];
  autoplayDelay?: number;
};

export function HeroCarousel({
  slides,
  autoplayDelay = 5000,
}: HeroCarouselProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!api) return;
    setSelectedIndex(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, onSelect]);

  const scrollTo = useCallback((index: number) => api?.scrollTo(index), [api]);

  return (
    <div className="absolute inset-0">
      <Carousel
        setApi={setApi}
        opts={{ loop: true }}
        plugins={[
          Fade(),
          Autoplay({
            delay: autoplayDelay,
            stopOnInteraction: false,
            stopOnMouseEnter: true,
          }),
        ]}
        className="h-full w-full"
      >
        <CarouselContent className="ml-0 h-full">
          {slides.map((slide, index) => (
            <CarouselItem key={slide.src} className="h-full pl-0">
              <div className="relative min-h-[92vh] w-full overflow-hidden">
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  priority={index === 0}
                  className={cn(
                    "object-cover",
                    selectedIndex === index && "animate-kenburns",
                  )}
                  sizes="100vw"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <div
        className="absolute bottom-8 right-4 flex items-center gap-3 sm:right-8 lg:right-12"
        aria-label="Hero image carousel controls"
      >
        <div className="flex gap-2">
          {slides.map((slide, index) => (
            <Button
              key={slide.src}
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => scrollTo(index)}
              aria-label={`Go to slide ${index + 1}: ${slide.alt}`}
              aria-current={selectedIndex === index ? "true" : undefined}
              className={cn(
                "h-2 min-w-0 rounded-full p-0 transition-all duration-300 hover:bg-white/70",
                selectedIndex === index
                  ? "w-8 bg-gold-light hover:bg-gold-light"
                  : "w-2 bg-white/40",
              )}
            />
          ))}
        </div>
        <span className="hidden font-body text-xs font-semibold tracking-widest text-white/70 sm:inline">
          {String(selectedIndex + 1).padStart(2, "0")} /{" "}
          {String(slides.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
