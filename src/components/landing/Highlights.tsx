import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { homeContent } from "@/lib/siteContent";

export function Highlights() {
  const { highlights } = homeContent;

  return (
    <Section
      subtitle={highlights.subtitle}
      title={highlights.title}
      dark
    >
      <p className="lead lead-light mx-auto mb-10 max-w-3xl text-center">
        {highlights.body}
      </p>
      <MotionStagger className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
        {highlights.stats.map((stat) => (
          <MotionItem key={stat.label}>
            <Card className="card-lift border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] text-center text-white ring-1 ring-white/10 transition-colors hover:ring-gold-light/40">
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
      </MotionStagger>
    </Section>
  );
}
