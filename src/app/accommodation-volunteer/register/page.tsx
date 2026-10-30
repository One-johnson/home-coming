import type { Metadata } from "next";
import { VolunteerRegisterForm } from "@/components/admin/VolunteerRegisterForm";

export const metadata: Metadata = {
  title: "Create an accommodation volunteer account",
  robots: { index: false, follow: false },
};

// Self-service sign-up for the volunteer door.
export default function AccommodationVolunteerRegisterPage() {
  return <VolunteerRegisterForm />;
}
