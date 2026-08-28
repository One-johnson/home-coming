import { Hero } from "@/components/landing/Hero";
import { EventDetails } from "@/components/landing/EventDetails";
import { Highlights } from "@/components/landing/Highlights";
import { VenueSection } from "@/components/landing/VenueSection";
import { HostSection } from "@/components/landing/HostSection";
import { GalleryPreview } from "@/components/landing/GalleryPreview";
import { MessagesPreview } from "@/components/landing/MessagesPreview";
import { RegistrationCTA } from "@/components/landing/RegistrationCTA";

export default function HomePage() {
  return (
    <>
      <Hero />
      <EventDetails />
      <Highlights />
      <RegistrationCTA />
      <VenueSection />
      <HostSection />
      <GalleryPreview />
      <MessagesPreview />
    </>
  );
}
