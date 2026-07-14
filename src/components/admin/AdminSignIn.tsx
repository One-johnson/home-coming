"use client";

import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { isConvexConfigured } from "@/lib/convex-config";

export function AdminSignIn() {
  const login = useAction(api.authActions.login);
  const canRegister = useQuery(api.users.canRegisterAdmin);
  const { setSession } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

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
      setSession(result.sessionToken);
      toast.success("Signed in");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setAuthError(message);
      toast.error(message);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-neutral-800 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 shadow-elevate">
        <h1 className="font-display text-3xl font-normal tracking-tight">
          Admin sign in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with your staff email and password.
        </p>

        <form onSubmit={handleSignIn} className="mt-8 space-y-4">
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
              <button
                type="button"
                className="absolute top-1/2 right-2.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-stone hover:bg-muted hover:text-ink"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>
          {authError && (
            <Alert variant="destructive">
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="h-11 w-full" disabled={signingIn}>
            {signingIn ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        {canRegister && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            First admin?{" "}
            <Link
              href="/admin/register"
              className="font-medium text-gold hover:text-gold-dark"
            >
              Create admin account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
