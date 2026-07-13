import { Section } from "@/components/ui/Section";
import { AccommodationPortal } from "@/components/accommodation/AccommodationPortal";

export default function AccommodationPage() {
  return (
    <Section
      subtitle="Stay on the Mountain"
      title="Book Your Accommodation"
      className="pt-24"
    >
      <p className="lead mx-auto mb-10 max-w-2xl text-center">
        Book campus housing at Anagkazo Campus or explore our list of preferred
        hotels near Mampong, Ghana.
      </p>
      <AccommodationPortal />
    </Section>
  );
}
