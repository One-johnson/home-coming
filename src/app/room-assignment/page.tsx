import type { Metadata } from "next";
import { TeamSignIn } from "@/components/admin/TeamSignIn";

export const metadata: Metadata = {
  title: "Room assignment team sign in",
  robots: { index: false, follow: false },
};

// Venue staff door — lands on the arrival desk after signing in.
export default function RoomAssignmentTeamSignInPage() {
  return <TeamSignIn team="room_assignment" />;
}
