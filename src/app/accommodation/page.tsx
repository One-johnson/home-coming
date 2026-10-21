import type { Metadata } from "next";
import { TeamSignIn } from "@/components/admin/TeamSignIn";

export const metadata: Metadata = {
  title: "Accommodation team sign in",
  robots: { index: false, follow: false },
};

export default function AccommodationTeamSignInPage() {
  return <TeamSignIn team="accommodation" />;
}
