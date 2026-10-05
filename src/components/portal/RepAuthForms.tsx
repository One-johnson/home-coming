"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import { LockoutIndicator } from "@/components/auth/LockoutIndicator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Button as IconButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyError, loginErrorInfo } from "@/lib/friendlyError";
import { EVENT } from "@/lib/eventConfig";

/** Shared ghost eye toggle for password fields. */
function PasswordEye({
  show,
  onToggle,
  inputId,
}: {
  show: boolean;
  onToggle: () => void;
  inputId: string;
}) {
  return (
    <IconButton
      type="button"
      variant="ghost"
      size="icon"
      className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      onClick={onToggle}
      aria-label={
        show ? `Hide password for ${inputId}` : `Show password for ${inputId}`
      }
    >
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </IconButton>
  );
}

/**
 * "Forgot username" helper: the rep confirms their registered email address
 * and the exact username is emailed to it. The server always reports success
 * so the form never reveals whether an email is registered.
 */
function RepForgotUsername({ onBack }: { onBack: () => void }) {
  const requestReminder = useAction(api.agcAuth.requestUsernameReminder);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await requestReminder({
        email,
        clientOrigin: window.location.origin,
      });
      setSent(true);
    } catch (err) {
      const friendly = friendlyError(err);
      setError(
        friendly.detail
          ? `${friendly.title}: ${friendly.detail}`
          : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-display text-2xl text-primary">
          Find your username
        </CardTitle>
        <CardDescription>
          Enter the email address on your representative account and
          we&rsquo;ll email your exact username to it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            If that email belongs to a representative account, the username is
            on its way — check your inbox (and spam folder).
          </p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="forgot-username-email">Account email</Label>
              <Input
                id="forgot-username-email"
                type="email"
                required
                autoComplete="email"
                placeholder="rep@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Email me my username"}
            </Button>
          </form>
        )}
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          ← Back to sign in
        </Button>
      </CardContent>
    </Card>
  );
}

export function RepSignIn() {
  const login = useAction(api.agcAuth.repLogin);
  const { setSession } = useRepSession();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupUsername, setSetupUsername] = useState<string | null>(null);
  const [showForgotUsername, setShowForgotUsername] = useState(false);

  // Lockout progress state from the latest failed sign-in.
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  // Exact stored username the server resolved — shown when the typed
  // username matched an account but the password was wrong.
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(null);

  const updateUsername = (next: string) => {
    setUsername(next);
    setResolvedUsername(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResolvedUsername(null);
    try {
      const outcome = await login({ username, password });

      // Expected state, not an error: route to first-time setup with a
      // friendly toast instead of surfacing a Convex exception.
      if (outcome.kind === "setup_required") {
        setSetupUsername(username.trim().toLowerCase());
        toast.info("First-time setup", {
          description:
            "Your account is still using a temporary password. Set a new password and complete your profile to activate it.",
        });
        return;
      }

      setSession(outcome.result.sessionToken, outcome.result.expiresAt);
      toast.success(`Welcome back, ${outcome.result.rep.hubName}`);
      router.refresh();
    } catch (err) {
      // Genuine failures only (invalid credentials, disabled account, lockout…).
      const friendly = friendlyError(err);
      setError(
        friendly.detail
          ? `${friendly.title}: ${friendly.detail}`
          : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
      // Drive the lockout indicator from structured server data when present.
      const info = loginErrorInfo(err);
      if (info.resolvedUsername) {
        setResolvedUsername(info.resolvedUsername);
      }
      if (info.lockedUntil) {
        setLockedUntil(info.lockedUntil);
        setAttemptsRemaining(null);
      } else if (typeof info.attemptsRemaining === "number") {
        setAttemptsRemaining(info.attemptsRemaining);
        setLockedUntil(null);
      }
    } finally {
      setLoading(false);
    }
  };

  if (setupUsername) {
    return (
      <RepFirstTimeSetup
        username={setupUsername}
        onBack={() => setSetupUsername(null)}
        onSetupComplete={setSession}
      />
    );
  }

  if (showForgotUsername) {
    return <RepForgotUsername onBack={() => setShowForgotUsername(false)} />;
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-display text-2xl text-primary">
          Representative sign in
        </CardTitle>
        <CardDescription>
          Sign in with your hub username and password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {resolvedUsername && (
            <Alert>
              <AlertDescription>
                We found your account — its exact username is{" "}
                <button
                  type="button"
                  className="font-mono font-semibold underline underline-offset-2"
                  onClick={() => updateUsername(resolvedUsername)}
                >
                  {resolvedUsername}
                </button>
                {" "}
                (click to fill it in). Spaces, hyphens or underscores all
                work — only the password was wrong.
              </AlertDescription>
            </Alert>
          )}
          {(attemptsRemaining !== null || lockedUntil !== null) && (
            <LockoutIndicator
              attemptsRemaining={attemptsRemaining}
              lockedUntil={lockedUntil}
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="rep-username">Hub username</Label>
            <Input
              id="rep-username"
              required
              autoComplete="username"
              placeholder="e.g. ashanti_mampong"
              value={username}
              onChange={(e) => updateUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your username is your hub name in lowercase — separators are
              flexible: the hub &ldquo;Ashanti Mampong&rdquo; signs in as{" "}
              <span className="font-mono">ashanti_mampong</span>,{" "}
              <span className="font-mono">ashanti-mampong</span> or{" "}
              <span className="font-mono">ashanti mampong</span>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-password">Password</Label>
            <div className="relative">
              <Input
                id="rep-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-11"
              />
              <PasswordEye
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                inputId="rep-password"
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/portal/reset-password"
            className="font-medium text-primary hover:underline"
          >
            Forgot your password?
          </Link>{" "}
          ·{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => setShowForgotUsername(true)}
          >
            Forgot your username?
          </button>{" "}
          · Contact the registration desk at{" "}
          <a
            href={`mailto:${EVENT.supportEmail}`}
            className="text-primary hover:underline"
          >
            {EVENT.supportEmail}
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * First-time setup. On success the action now activates the account and
 * returns a session, so the rep is signed in immediately — no second login,
 * no "setup complete" card.
 */
export function RepFirstTimeSetup({
  username,
  onBack,
  onSetupComplete,
}: {
  username: string;
  onBack?: () => void;
  onSetupComplete: (sessionToken: string, expiresAt?: number) => void;
}) {
  const completeSetup = useAction(api.agcAuth.completeFirstLoginSetup);
  const router = useRouter();

  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTemp, setShowTemp] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      toast.error("Passwords don't match", {
        description: "Re-enter the same password in both fields.",
      });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { sessionToken, expiresAt, rep } = await completeSetup({
        username,
        temporaryPassword,
        newPassword,
        firstName,
        lastName,
        email,
        phone,
      });

      // Activated and signed in — land directly in the portal.
      onSetupComplete(sessionToken, expiresAt);
      toast.success(`Welcome, ${rep.hubName}! Your account is ready.`);
      router.refresh();
    } catch (err) {
      const friendly = friendlyError(err);
      setError(
        friendly.detail
          ? `${friendly.title}: ${friendly.detail}`
          : friendly.title,
      );
      toast.error(friendly.title, { description: friendly.detail });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle className="font-display text-2xl text-primary">
          First-time setup
        </CardTitle>
        <CardDescription>
          Welcome, representative of <strong>{username}</strong>. Choose a new
          password and complete your profile — you&rsquo;ll be signed in right
          after.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="setup-temp">Temporary password</Label>
            <div className="relative">
              <Input
                id="setup-temp"
                type={showTemp ? "text" : "password"}
                required
                autoComplete="off"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
                className="pr-11"
              />
              <PasswordEye
                show={showTemp}
                onToggle={() => setShowTemp((v) => !v)}
                inputId="setup-temp"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ask the registration desk for your hub&rsquo;s temporary
              password.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="setup-first">First name</Label>
              <Input
                id="setup-first"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-last">Last name</Label>
              <Input
                id="setup-last"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="setup-email">Email</Label>
              <Input
                id="setup-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-phone">Phone</Label>
              <Input
                id="setup-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="setup-new">New password</Label>
              <div className="relative">
                <Input
                  id="setup-new"
                  type={showNew ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-11"
                />
                <PasswordEye
                  show={showNew}
                  onToggle={() => setShowNew((v) => !v)}
                  inputId="setup-new"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm">Confirm new password</Label>
              <div className="relative">
                <Input
                  id="setup-confirm"
                  type={showConfirm ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-11"
                />
                <PasswordEye
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  inputId="setup-confirm"
                />
              </div>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Setting up your account…" : "Activate account"}
          </Button>
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={onBack}
            >
              ← Back to sign in
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
