"use client";

import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Section } from "@/components/ui/Section";
import { LinkButton as Button } from "@/components/ui/app-button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isConvexConfigured } from "@/lib/convex-config";

type AboutData = {
  history: string;
  purpose: string;
  vision: string;
  impact: string;
  firstLadyMessage: string;
} | null | undefined;

function AboutPageContent({ about }: { about: AboutData }) {
  return (
    <>
      <Section
        subtitle="Our Story"
        title="About The Homecoming Convention"
        className="pt-24"
      >
        <Card className="mx-auto max-w-3xl">
          <CardContent className="space-y-6 pt-6 text-body">
            <p>{about?.history ?? "Content loading..."}</p>
            <Separator />
            <div>
              <CardTitle className="font-display text-2xl text-primary">Purpose</CardTitle>
              <p className="mt-2">{about?.purpose}</p>
            </div>
            <Separator />
            <div>
              <CardTitle className="font-display text-2xl text-primary">Vision</CardTitle>
              <p className="mt-2">{about?.vision}</p>
            </div>
            <Separator />
            <div>
              <CardTitle className="font-display text-2xl text-primary">Expected Impact</CardTitle>
              <p className="mt-2">{about?.impact}</p>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section className="bg-cream" subtitle="A Word of Welcome" title="From the First Lady">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <Card className="overflow-hidden pt-0">
            <AspectRatio ratio={4 / 3}>
              <Image
                src="https://picsum.photos/seed/homecoming-welcome/800/600"
                alt="Past Homecoming Convention gathering"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </AspectRatio>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="lead border-l-2 border-gold pl-6 text-base not-italic">
                &ldquo;{about?.firstLadyMessage ?? "Welcome message coming soon."}&rdquo;
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Section>

      <Section dark title="Ready to Join Us?">
        <p className="lead lead-light mx-auto mb-8 max-w-2xl text-center">
          Register for the convention and secure your accommodation today.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button href="/registration">Register Now</Button>
          <Button
            href="/accommodation"
            variant="outline"
            className="border-white text-white hover:bg-white hover:text-primary"
          >
            Book Accommodation
          </Button>
        </div>
      </Section>
    </>
  );
}

function AboutPageConnected() {
  const about = useQuery(api.content.getAbout);
  return <AboutPageContent about={about} />;
}

export default function AboutPage() {
  if (!isConvexConfigured()) {
    return <AboutPageContent about={null} />;
  }
  return <AboutPageConnected />;
}
