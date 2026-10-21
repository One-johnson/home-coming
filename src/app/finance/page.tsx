import type { Metadata } from "next";
import { TeamSignIn } from "@/components/admin/TeamSignIn";

export const metadata: Metadata = {
  title: "Finance team sign in",
  robots: { index: false, follow: false },
};

export default function FinanceTeamSignInPage() {
  return <TeamSignIn team="finance" />;
}
