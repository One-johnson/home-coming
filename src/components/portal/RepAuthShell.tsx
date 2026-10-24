import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { CONFERENCE_MONOGRAM, CONFERENCE_NAME } from "@/lib/eventConfig";

/**
 * Frame for every signed-out rep screen (sign in, first-time setup, username
 * reminder, password reset). The layout lives in `AuthShell` so the staff
 * sign-ins look the same; this wrapper only fixes the rep-facing identity.
 */
export function RepAuthShell({
  children,
  size = "md",
}: {
  children: ReactNode;
  /** Setup collects a profile, so its card is wider than a plain sign in. */
  size?: "md" | "lg";
}) {
  return (
    <AuthShell
      brand={CONFERENCE_NAME}
      monogram={CONFERENCE_MONOGRAM}
      eyebrow="Representative portal"
      size={size}
    >
      {children}
    </AuthShell>
  );
}
