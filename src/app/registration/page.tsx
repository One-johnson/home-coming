import type { Metadata } from "next";
import { TeamSignIn } from "@/components/admin/TeamSignIn";

export const metadata: Metadata = {
  title: "Registration team sign in",
  robots: { index: false, follow: false },
};

/**
 * Dedicated sign-in for the Registration team. Hub registration itself is
 * handled by hub representatives in /portal; staff teams each have their own
 * door (/admin, /registration, /accommodation, /finance, /content).
 */
export default function RegistrationTeamSignInPage() {
  return <TeamSignIn team="registration" />;
}
