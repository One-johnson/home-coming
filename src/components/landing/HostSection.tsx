import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import { HostBio } from "@/components/landing/HostBio";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EVENT } from "@/lib/eventConfig";

export function HostSection() {
  return (
    <Section subtitle="Founder & Host" title={EVENT.host} className="bg-cream">
      <MotionStagger className="grid items-stretch gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <MotionItem className="h-full min-h-[320px] sm:min-h-[420px]">
          <Card className="group h-full overflow-hidden pt-0 shadow-elevate ring-1 ring-border">
            <div className="relative h-full min-h-[320px] sm:min-h-[420px]">
              <Image
                src="/dag-main.jpg"
                alt={`${EVENT.host} speaking at The Homecoming Convention`}
                fill
                className="object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                sizes="(max-width: 1024px) 100vw, 38vw"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/50 via-transparent to-transparent" />
            </div>
          </Card>
        </MotionItem>
        <MotionItem className="h-full">
          <Card className="flex h-full flex-col shadow-soft ring-1 ring-border">
            <CardHeader>
              <CardTitle className="font-display text-3xl">Founder & Lead Speaker</CardTitle>
              <CardDescription className="mt-1 text-base font-medium not-italic text-soft-ink">
                Host of The Homecoming Convention at Anagkazo Campus.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <HostBio />
            </CardContent>
          </Card>
        </MotionItem>
      </MotionStagger>
    </Section>
  );
}
