"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSignIn } from "@/components/admin/AdminSignIn";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import {
  TEAM_LOGINS,
  canSignInToTeam,
  type TeamKey,
} from "@/lib/teamLogins";

/**
 * A team's dedicated sign-in route. If a member of this team already has a
 * valid session (e.g. they bookmarked the login URL), send them straight to
 * their home screen instead of showing the form again.
 */
export function TeamSignIn({ team }: { team: TeamKey }) {
  const { user } = useAdminSession();
  const router = useRouter();
  const config = TEAM_LOGINS[team];

  useEffect(() => {
    if (user && canSignInToTeam(user.role, team)) {
      router.replace(config.homePath);
    }
  }, [user, team, config.homePath, router]);

  return <AdminSignIn team={team} />;
}
