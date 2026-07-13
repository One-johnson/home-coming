"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type TypewriterOnViewProps = {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
};

type TypewriterSequenceProps = {
  paragraphs: readonly string[];
  speed?: number;
  className?: string;
  onComplete?: () => void;
};

export function TypewriterOnView({
  text,
  speed = 38,
  className,
  onComplete,
}: TypewriterOnViewProps) {
  const shouldReduceMotion = useReducedMotion();
  const ref = useRef<HTMLParagraphElement>(null);
  const [displayed, setDisplayed] = useState(shouldReduceMotion ? text : "");
  const [started, setStarted] = useState(shouldReduceMotion);
  const [done, setDone] = useState(shouldReduceMotion);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35, rootMargin: "-40px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (!started || shouldReduceMotion) return;

    let index = 0;
    const interval = setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));

      if (index >= text.length) {
        clearInterval(interval);
        setDone(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [started, text, speed, shouldReduceMotion, onComplete]);

  return (
    <p ref={ref} className={cn("text-body", className)} aria-label={text}>
      <span aria-hidden="true">{displayed}</span>
      {!done && !shouldReduceMotion && (
        <span
          className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-px animate-pulse bg-gold"
          aria-hidden
        />
      )}
    </p>
  );
}

export function TypewriterSequence({
  paragraphs,
  speed = 38,
  className,
  onComplete,
}: TypewriterSequenceProps) {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(shouldReduceMotion);
  const [paragraphIndex, setParagraphIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(
    shouldReduceMotion ? Number.MAX_SAFE_INTEGER : 0,
  );
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (shouldReduceMotion) return;

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25, rootMargin: "-40px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (!started || shouldReduceMotion) return;
    if (paragraphIndex >= paragraphs.length) return;

    const currentParagraph = paragraphs[paragraphIndex];
    if (charIndex >= currentParagraph.length) return;

    const interval = setInterval(() => {
      setCharIndex((previous) => {
        const next = previous + 1;
        if (next >= currentParagraph.length) {
          clearInterval(interval);
        }
        return next;
      });
    }, speed);

    return () => clearInterval(interval);
  }, [started, shouldReduceMotion, paragraphIndex, charIndex, paragraphs, speed]);

  useEffect(() => {
    if (!started || shouldReduceMotion) return;
    if (paragraphIndex >= paragraphs.length) return;

    const currentParagraph = paragraphs[paragraphIndex];
    if (charIndex < currentParagraph.length) return;

    const advanceTimer = setTimeout(() => {
      const nextIndex = paragraphIndex + 1;
      if (nextIndex >= paragraphs.length) {
        onCompleteRef.current?.();
        setParagraphIndex(nextIndex);
        return;
      }

      setParagraphIndex(nextIndex);
      setCharIndex(0);
    }, 280);

    return () => clearTimeout(advanceTimer);
  }, [started, shouldReduceMotion, paragraphIndex, charIndex, paragraphs.length]);

  if (shouldReduceMotion) {
    return (
      <div className="space-y-4">
        {paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 40)} className={cn("text-body", className)}>
            {paragraph}
          </p>
        ))}
      </div>
    );
  }

  const currentParagraph = paragraphs[paragraphIndex] ?? "";

  return (
    <div ref={containerRef} className="space-y-4">
      {paragraphs.slice(0, paragraphIndex).map((paragraph) => (
        <p key={paragraph.slice(0, 40)} className={cn("text-body", className)}>
          {paragraph}
        </p>
      ))}

      {paragraphIndex < paragraphs.length && (
        <p className={cn("text-body", className)} aria-label={currentParagraph}>
          <span aria-hidden="true">{currentParagraph.slice(0, charIndex)}</span>
          <span
            className="ml-0.5 inline-block h-[1.05em] w-0.5 translate-y-px animate-pulse bg-gold"
            aria-hidden
          />
        </p>
      )}
    </div>
  );
}
