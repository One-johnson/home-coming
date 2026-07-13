import { Calendar, MapPin, Mic, Users } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT } from "@/lib/eventConfig";

const details = [
  {
    icon: Calendar,
    label: "Dates",
    value: EVENT.dates,
  },
  {
    icon: MapPin,
    label: "Venue",
    value: `${EVENT.venue}, ${EVENT.location}`,
  },
  {
    icon: Mic,
    label: "Host & Speaker",
    value: EVENT.host,
  },
  {
    icon: Users,
    label: "Audience",
    value:
      "International attendees, church members, pastors, ministry leaders, groups, families, and guests",
  },
];

export function EventDetails() {
  return (
    <Section subtitle="Event Details" title={EVENT.fullTitle}>
      <MotionStagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {details.map((item) => (
          <MotionItem key={item.label}>
          <Card className="card-lift shadow-soft group h-full ring-1 ring-border transition-colors hover:ring-gold/50">
            <CardHeader>
              <span className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 ring-1 ring-gold/25 transition-colors group-hover:bg-gold/15">
                <item.icon className="h-6 w-6 text-accent" aria-hidden />
              </span>
              <CardTitle className="font-body text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-body text-sm leading-relaxed">
                {item.value}
              </CardDescription>
            </CardContent>
          </Card>
          </MotionItem>
        ))}
      </MotionStagger>
    </Section>
  );
}
