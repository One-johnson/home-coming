"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { isConvexConfigured } from "@/lib/convex-config";
import { cn } from "@/lib/utils";
import { EVENT } from "@/lib/eventConfig";

function FieldIconWrap({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone"
        aria-hidden
      />
      {children}
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone"
          aria-hidden
        />
        <Input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={8}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 pr-11 pl-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-2.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-stone transition-colors hover:bg-muted hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-white shadow-elevate lg:min-h-[36rem] lg:grid-cols-2">
      <aside className="relative hidden min-h-[22rem] overflow-hidden lg:block">
        <Image
          src="/hero/banner.jpeg"
          alt=""
          fill
          priority
          className="object-cover object-center"
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
      </aside>

      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <Image
            src="/dhmm.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 object-contain"
          />
          <div>
            <p className="eyebrow mb-0">Staff access</p>
            <p className="text-sm text-muted-foreground">{EVENT.name}</p>
          </div>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

function AdminRegisterInner() {
  const router = useRouter();
  const canRegister = useQuery(api.users.canRegisterAdmin);
  const register = useAction(api.authActions.registerInitialAdmin);
  const { setSession, user, isReady } = useAdminSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordsMatch = confirm.length === 0 || password === confirm;
  const passwordStrongEnough = password.length === 0 || password.length >= 8;

  if (!isReady || canRegister === undefined) {
    return (
      <AuthShell>
        <p className="text-muted-foreground">Loading...</p>
      </AuthShell>
    );
  }

  if (user) {
    return (
      <AuthShell>
        <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-gold/15 text-gold">
          <ShieldCheck className="size-6" aria-hidden />
        </div>
        <h1 className="font-display text-3xl font-normal tracking-tight">
          Already signed in
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as {user.email}.
        </p>
        <Button href="/admin" className="mt-8 w-full">
          Go to dashboard
        </Button>
      </AuthShell>
    );
  }

  if (!canRegister) {
    return (
      <AuthShell>
        <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-gold/15 text-gold">
          <ShieldCheck className="size-6" aria-hidden />
        </div>
        <h1 className="font-display text-3xl font-normal tracking-tight">
          Setup complete
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          An admin already exists. Ask an administrator to create your account
          from the Team tab, then sign in.
        </p>
        <Button href="/admin" className="mt-8 w-full">
          Back to sign in
        </Button>
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
      setSession(result.sessionToken);
      toast.success("Admin account created");
      router.replace("/admin");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Registration failed";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      footer={
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/admin"
            className="font-medium text-gold transition-colors hover:text-gold-dark"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-gold/15 text-gold">
        <ShieldCheck className="size-6" aria-hidden />
      </div>
      <h1 className="font-display text-3xl font-normal tracking-tight">
        Create admin account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        First-time setup only. After this, invite staff from the Team dashboard.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-name">Full name</Label>
          <FieldIconWrap icon={User}>
            <Input
              id="admin-name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 pl-10"
              placeholder="Your full name"
            />
          </FieldIconWrap>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reg-email">Email</Label>
          <FieldIconWrap icon={Mail}>
            <Input
              id="reg-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 pl-10"
              placeholder="you@ministry.org"
            />
          </FieldIconWrap>
        </div>

        <PasswordField
          id="reg-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <p
          className={cn(
            "text-xs",
            passwordStrongEnough ? "text-muted-foreground" : "text-destructive",
          )}
        >
          Use at least 8 characters.
        </p>

        <PasswordField
          id="reg-confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {!passwordsMatch && (
          <p className="text-xs text-destructive">Passwords do not match.</p>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="mt-2 h-11 w-full border-gold bg-gradient-to-r from-gold-light via-[#f0e6c8] to-gold text-ink hover:from-gold hover:via-gold-light hover:to-gold-dark hover:text-ink"
          disabled={submitting || !passwordsMatch}
        >
          {submitting ? "Creating account..." : "Create admin account"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function AdminRegisterForm() {
  if (!isConvexConfigured()) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
        Requires Convex. Run{" "}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
          npx convex dev
        </code>
        .
      </p>
    );
  }
  return <AdminRegisterInner />;
}
