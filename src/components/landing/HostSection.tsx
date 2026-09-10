import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { MotionItem, MotionStagger } from "@/components/ui/motion";
import { HostBio } from "@/components/landing/HostBio";
import { EVENT } from "@/lib/eventConfig";
import { homeContent } from "@/lib/siteContent";

export function HostSection() {
  const { host } = homeContent;

  return (
    <Section subtitle={host.subtitle} title={EVENT.host} className="bg-cream">
      <MotionStagger className="space-y-10">
        <MotionItem className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="relative min-h-[280px] overflow-hidden rounded-2xl shadow-elevate sm:min-h-[360px]">
            <Image
              src={host.image}
              alt={`${EVENT.host} speaking at Homecoming`}
              fill
              className="object-cover object-top"
              sizes="(max-width: 1024px) 100vw, 42vw"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/45 via-transparent to-transparent" />
          </div>
          <div>
            <h3 className="font-display text-3xl text-foreground md:text-4xl">
              {host.role}
            </h3>
            <p className="mt-3 max-w-xl font-body text-base text-soft-ink md:text-lg">
              {host.roleDescription}
            </p>
          </div>
        </MotionItem>

        <MotionItem>
          <HostBio />
        </MotionItem>
      </MotionStagger>
    </Section>
  );
}
