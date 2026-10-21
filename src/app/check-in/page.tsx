import type { Metadata } from "next";
import { TeamSignIn } from "@/components/admin/TeamSignIn";

export const metadata: Metadata = {
  title: "Check-in team sign in",
  robots: { index: false, follow: false },
};

// Venue staff door — lands on the arrival desk after signing in.
export default function CheckinTeamSignInPage() {
  return <TeamSignIn team="checkin" />;
}
