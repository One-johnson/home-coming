"use client";

import { toastFriendlyErrorParts } from "@/lib/friendlyError";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { LockoutIndicator } from "@/components/auth/LockoutIndicator";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { ROLE_LABELS, type StaffRole } from "@/lib/adminRoles";
import { isConvexConfigured } from "@/lib/convex-config";
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
      <div className="flex min-h-svh items-center justify-center bg-neutral-800 px-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Admin requires Convex. Run{" "}
          <code className="font-mono text-xs">npx convex dev</code>.
        </p>
      </div>
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
    <div className="flex min-h-svh items-center justify-center bg-neutral-800 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 shadow-elevate">
        <h1 className="font-display text-3xl font-normal tracking-tight">
          {teamConfig ? `${teamConfig.label} team sign in` : "Admin sign in"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {teamConfig
            ? teamConfig.description
            : "Sign in with your staff email and password."}
        </p>

        <form onSubmit={handleSignIn} className="mt-8 space-y-4">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 pl-10"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pr-11 pl-10"
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

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link
            href="/admin/reset-password"
            className="font-medium text-gold hover:text-gold-dark"
          >
            Forgot your password?
          </Link>
        </p>

        {teamConfig ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {teamConfig.label} team only — accounts are created by an admin in
            Team.{" "}
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
        ) : (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Need an account?{" "}
            <Link
              href="/admin/register"
              className="font-medium text-gold hover:text-gold-dark"
            >
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
