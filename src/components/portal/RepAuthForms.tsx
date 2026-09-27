"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useRepSession } from "@/components/portal/RepSessionProvider";
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
import { EVENT } from "@/lib/eventConfig";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await login({ username, password });
      setSession(result.sessionToken);
      toast.success(`Welcome back, ${result.rep.hubName}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      // Reps whose first login is pending are pointed to setup mode.
      if (message.toLowerCase().includes("first-time")) {
        setSetupUsername(username);
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
      />
    );
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
          <div className="space-y-2">
            <Label htmlFor="rep-username">Hub username</Label>
            <Input
              id="rep-username"
              required
              autoComplete="username"
              placeholder="e.g. ashanti_mampong"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your username is your hub name in lowercase with spaces replaced
              by underscores — e.g. the hub "Ashanti Mampong" signs in as{" "}
              <span className="font-mono">ashanti_mampong</span>.
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
              <IconButton
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </IconButton>
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

export function RepFirstTimeSetup({
  username,
  onBack,
}: {
  username: string;
  onBack?: () => void;
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
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await completeSetup({
        username,
        temporaryPassword,
        newPassword,
        firstName,
        lastName,
        email,
        phone,
      });
      setDone(true);
      toast.success("Setup complete — now sign in with your new password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-display text-2xl text-primary">
            Setup complete
          </CardTitle>
          <CardDescription>
            Your profile is saved and your new password is set. Sign in with
            your username and new password to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.push("/portal")}>
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle className="font-display text-2xl text-primary">
          First-time setup
        </CardTitle>
        <CardDescription>
          Welcome, representative of <strong>{username}</strong>. Choose a new
          password and complete your profile, then sign in to activate the
          account.
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
            <Input
              id="setup-temp"
              type="password"
              required
              autoComplete="off"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
            />
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
              <Input
                id="setup-new"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm">Confirm new password</Label>
              <Input
                id="setup-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Activating…" : "Activate account"}
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
