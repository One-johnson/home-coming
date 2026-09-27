"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AdminResetPassword() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const requestReset = useAction(api.authActions.requestAdminPasswordReset);
  const resetPassword = useAction(api.authActions.resetAdminPassword);

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestReset({ email, clientOrigin: window.location.origin });
      // Always reported as sent — the endpoint never reveals valid emails.
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await resetPassword({ token: token ?? "", newPassword });
      setDone(true);
      toast.success("Password updated — sign in with your new password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-display text-2xl">
            Password updated
          </CardTitle>
          <CardDescription>
            All previous sessions were signed out. Sign in with your new
            password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button href="/admin" className="h-11 w-full">
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            Choose a new password
          </CardTitle>
          <CardDescription>
            Enter a new password for your admin account. The link expires after
            3 hours and can only be used once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="reset-new">New password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" />
                <Input
                  id="reset-new"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
            <div className="space-y-2">
              <Label htmlFor="reset-confirm">Confirm new password</Label>
              <Input
                id="reset-confirm"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/admin/reset-password"
                className="font-medium text-gold hover:text-gold-dark"
              >
                Request a new link
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-display text-2xl">
          Forgot your password?
        </CardTitle>
        <CardDescription>
          Enter your admin email and we&apos;ll send a reset link (valid for 3
          hours).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                If an account exists for <strong>{email}</strong>, a reset link
                is on its way. Check your inbox (and spam folder).
              </AlertDescription>
            </Alert>
            <Button href="/admin" className="w-full">
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRequest} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" />
                <Input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10"
                />
              </div>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/admin"
                className="font-medium text-gold hover:text-gold-dark"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
