"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { isConvexConfigured } from "@/lib/convex-config";

function HighlightsContent({
  stats,
}: {
  stats: { _id: string; label: string; value: string }[];
}) {
  return (
    <Section
      subtitle="Last Year's Homecoming"
      title="Celebrating What God Has Done"
      dark
    >
      <p className="lead lead-light mx-auto mb-10 max-w-3xl text-center">
        The previous Homecoming Convention brought together believers from across
        the globe for worship, teaching, and fellowship on the mountain.
      </p>
      <MotionStagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <MotionItem key={stat._id}>
          <Card
            key={stat._id}
            className="card-lift border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] text-center text-white ring-1 ring-white/10 transition-colors hover:ring-gold-light/40"
          >
            <CardHeader className="items-center">
              <p className="text-gold-gradient font-display text-5xl font-normal tabular-nums">
                {stat.value}
              </p>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-sm font-medium uppercase tracking-wider text-white/80">
                {stat.label}
              </CardDescription>
            </CardContent>
          </Card>
          </MotionItem>
        ))}
        {!stats.length && (
          <p className="col-span-full text-center text-white/85">
            Statistics coming soon.
          </p>
        )}
      </MotionStagger>
    </Section>
  );
}

function HighlightsConnected() {
  const stats = useQuery(api.content.listStats);
  return <HighlightsContent stats={stats ?? []} />;
}

export function Highlights() {
  if (!isConvexConfigured()) {
    return <HighlightsContent stats={[]} />;
  }
  return <HighlightsConnected />;
}
