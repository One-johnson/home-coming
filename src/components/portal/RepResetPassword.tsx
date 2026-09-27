"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LinkButton as Button } from "@/components/ui/app-button";
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

export function RepResetPassword() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { setSession } = useRepSession();

  const requestReset = useAction(api.agcAuth.requestPasswordReset);
  const resetPassword = useAction(api.agcAuth.resetPassword);

  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [tokenUsed, setTokenUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestReset({ username, clientOrigin: window.location.origin });
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
      toast.success("Password updated — sign in with your new password");
      setSent(true);
      setTokenUsed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  if (token && !tokenUsed) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-display text-2xl text-primary">
            Choose a new password
          </CardTitle>
          <CardDescription>
            Enter a new password for your representative account. The link
            expires after 3 hours and can only be used once.
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
              <Label htmlFor="rep-reset-new">New password</Label>
              <Input
                id="rep-reset-new"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep-reset-confirm">Confirm new password</Label>
              <Input
                id="rep-reset-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/portal"
                className="font-medium text-primary hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="items-center text-center">
        <CardTitle className="font-display text-2xl text-primary">
          {tokenUsed ? "Password updated" : "Forgot your password?"}
        </CardTitle>
        <CardDescription>
          {tokenUsed
            ? "Sign in with your new password."
            : "Enter your hub username and we'll send a reset link to the email on your account (valid for 3 hours)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                If a reset link can be sent for <strong>{username}</strong>, it
                is on its way. Check your inbox (and spam folder). If your
                account has no email yet, contact the registration desk at{" "}
                <a
                  href={`mailto:${EVENT.supportEmail}`}
                  className="text-primary hover:underline"
                >
                  {EVENT.supportEmail}
                </a>
                .
              </AlertDescription>
            </Alert>
            <Button href="/portal" className="w-full">
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
              <Label htmlFor="rep-reset-username">Hub username</Label>
              <Input
                id="rep-reset-username"
                required
                autoComplete="username"
                placeholder="e.g. christ_temple"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/portal"
                className="font-medium text-primary hover:underline"
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
