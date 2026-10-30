"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { api } from "@convex/_generated/api";
import { AuthShell } from "@/components/auth/AuthShell";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { toastFriendlyErrorParts } from "@/lib/friendlyError";
import { CONFERENCE_MONOGRAM, CONFERENCE_NAME } from "@/lib/eventConfig";
import { TEAM_LOGINS } from "@/lib/teamLogins";

const TEAM = TEAM_LOGINS.accommodation_volunteer;

/**
 * Volunteers create their own account at /accommodation-volunteer/register.
 * The server fixes the role (`accommodation_volunteer`), so this form can only
 * ever produce the read-only directory account.
 */
export function VolunteerRegisterForm() {
  const router = useRouter();
  const register = useAction(api.authActions.registerAccommodationVolunteer);
  const { setSession, user } = useAdminSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordsMatch = confirm.length === 0 || password === confirm;

  if (user) {
    return (
      <AuthShell
        brand={CONFERENCE_NAME}
        monogram={CONFERENCE_MONOGRAM}
        eyebrow="Accommodation volunteers"
      >
        <div className="rounded-2xl border border-border/70 bg-white p-6 shadow-elevate">
          <h1 className="font-display text-2xl">Already signed in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in as {user.email}.
          </p>
          <Button href={TEAM.homePath} className="mt-6 w-full">
            Open the delegate directory
          </Button>
        </div>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({ name, email, password });
      setSession(result.sessionToken, result.expiresAt);
      toast.success("Volunteer account created");
      router.replace(TEAM.homePath);
    } catch (err) {
      const message = toastFriendlyErrorParts.toastMessage(
        err,
        "Could not create your account",
      );
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      brand={CONFERENCE_NAME}
      monogram={CONFERENCE_MONOGRAM}
      eyebrow="Accommodation volunteers"
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={TEAM.signInPath}
            className="font-medium text-gold hover:text-gold-dark"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <div className="rounded-2xl border border-border/70 bg-white p-6 shadow-elevate">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-gold/15 text-gold-dark">
          <ShieldCheck className="size-5" aria-hidden />
        </div>
        <h1 className="font-display text-2xl">Create your volunteer account</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Read-only access to every rep, delegate and room — enough to point
          delegates to the right room. You cannot change any record.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="volunteer-name">Full name</Label>
            <Input
              id="volunteer-name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 text-base sm:text-sm"
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="volunteer-email">Email</Label>
            <Input
              id="volunteer-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 text-base sm:text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="volunteer-password">Password</Label>
            <Input
              id="volunteer-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 text-base sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use at least 8 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="volunteer-confirm">Confirm password</Label>
            <Input
              id="volunteer-confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 text-base sm:text-sm"
            />
            {!passwordsMatch && (
              <p className="text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={submitting || !passwordsMatch}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
