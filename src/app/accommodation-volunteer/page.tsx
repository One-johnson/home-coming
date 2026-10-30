import type { Metadata } from "next";
import { TeamSignIn } from "@/components/admin/TeamSignIn";

export const metadata: Metadata = {
  title: "Accommodation volunteer sign in",
  robots: { index: false, follow: false },
};

// Volunteer door — lands on the read-only delegate directory after signing in.
export default function AccommodationVolunteerSignInPage() {
  return <TeamSignIn team="accommodation_volunteer" />;
}
