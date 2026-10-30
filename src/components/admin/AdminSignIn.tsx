"use client";

import { toastFriendlyErrorParts } from "@/lib/friendlyError";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { AuthShell } from "@/components/auth/AuthShell";
import { LockoutIndicator } from "@/components/auth/LockoutIndicator";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { ROLE_LABELS, type StaffRole } from "@/lib/adminRoles";
import { isConvexConfigured } from "@/lib/convex-config";
import { CONFERENCE_MONOGRAM, CONFERENCE_NAME } from "@/lib/eventConfig";
import { loginErrorInfo } from "@/lib/friendlyError";
import {
  TEAM_LOGINS,
  canSignInToTeam,
  otherTeamLogins,
  signInPathForRole,
  type TeamKey,
} from "@/lib/teamLogins";

export function AdminSignIn({ team }: { team?: TeamKey } = {}) {
  const login = useAction(api.authActions.login);
  const { setSession } = useAdminSession();
  const router = useRouter();
  const teamConfig = team ? TEAM_LOGINS[team] : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  // Lockout progress state from the latest failed sign-in.
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  if (!isConvexConfigured()) {
    return (
      <AuthShell
        brand={CONFERENCE_NAME}
        monogram={CONFERENCE_MONOGRAM}
        eyebrow={teamConfig ? `${teamConfig.label} team` : "Admin console"}
      >
        <Card className="w-full border-border/70 p-6 shadow-elevate">
          <p className="text-sm text-muted-foreground">
            The console requires Convex. Run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              npx convex dev
            </code>
            .
          </p>
        </Card>
      </AuthShell>
    );
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setSigningIn(true);
    try {
      const result = await login({ email, password });
      const role = result.user?.role as StaffRole | undefined;

      // Dedicated team routes only accept their own team's accounts.
      if (teamConfig && !canSignInToTeam(role, teamConfig.key)) {
        const roleLabel = role ? ROLE_LABELS[role] ?? role : "unknown";
        const correctPath = signInPathForRole(role);
        const message = `This is the ${teamConfig.label} team sign-in, but your account is ${roleLabel}. Sign in at ${correctPath} instead.`;
        setAuthError(message);
        toast.error(message);
        return;
      }

      setSession(result.sessionToken, result.expiresAt);
      toast.success("Signed in");
      if (teamConfig) {
        router.replace(teamConfig.homePath);
      }
    } catch (err) {
      const message = toastFriendlyErrorParts.toastMessage(err, "Sign in failed");
      setAuthError(message);
      toast.error(message);
      // Drive the lockout indicator from structured server data when present.
      const info = loginErrorInfo(err);
      if (info.lockedUntil) {
        setLockedUntil(info.lockedUntil);
        setAttemptsRemaining(null);
      } else if (typeof info.attemptsRemaining === "number") {
        setAttemptsRemaining(info.attemptsRemaining);
        setLockedUntil(null);
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <AuthShell
      brand={CONFERENCE_NAME}
      monogram={CONFERENCE_MONOGRAM}
      eyebrow={teamConfig ? `${teamConfig.label} team` : "Admin console"}
    >
      <Card className="w-full border-border/70 shadow-elevate">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-display text-2xl text-primary">
            {teamConfig ? `${teamConfig.label} team sign in` : "Staff sign in"}
          </CardTitle>
          <CardDescription>
            {teamConfig
              ? teamConfig.description
              : "Sign in with your staff email and password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            {(attemptsRemaining !== null || lockedUntil !== null) && (
              <LockoutIndicator
                attemptsRemaining={attemptsRemaining}
                lockedUntil={lockedUntil}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" />
                <Input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10 text-base sm:text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" />
                <Input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-11 pl-10 text-base sm:text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-stone hover:bg-muted hover:text-ink"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              </div>
            </div>
            {authError && (
              <Alert variant="destructive">
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="h-11 w-full" disabled={signingIn}>
              {signingIn ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-6 space-y-3 border-t border-border/70 pt-4">
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/admin/reset-password"
                className="font-medium text-gold hover:text-gold-dark"
              >
                Forgot your password?
              </Link>
            </p>
            {teamConfig ? (
              <div className="space-y-2 text-center text-xs text-muted-foreground">
                {teamConfig.selfSignUpPath && (
                  <p>
                    New volunteer?{" "}
                    <Link
                      href={teamConfig.selfSignUpPath}
                      className="font-medium text-gold hover:text-gold-dark"
                    >
                      Create your own account
                    </Link>
                    .
                  </p>
                )}
                <p>
                  {teamConfig.label} team only —
                  {teamConfig.selfSignUpPath
                    ? " sign up here or ask an admin to create your account on the Team page."
                    : " accounts are created by an admin on the Team page."}{" "}
                  Other teams:{" "}
                  {otherTeamLogins(teamConfig.key).map((other, index) => (
                    <span key={other.key}>
                      {index > 0 ? " · " : ""}
                      <Link
                        href={other.signInPath}
                        className="font-medium text-gold hover:text-gold-dark"
                      >
                        {other.label}
                      </Link>
                    </span>
                  ))}
                </p>
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Need an account?{" "}
                <Link
                  href="/admin/register"
                  className="font-medium text-gold hover:text-gold-dark"
                >
                  Create one
                </Link>{" "}
                — the first account bootstraps the console.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
