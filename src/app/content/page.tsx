import type { Metadata } from "next";
import { TeamSignIn } from "@/components/admin/TeamSignIn";

export const metadata: Metadata = {
  title: "Content team sign in",
  robots: { index: false, follow: false },
};

export default function ContentTeamSignInPage() {
  return <TeamSignIn team="content" />;
}
