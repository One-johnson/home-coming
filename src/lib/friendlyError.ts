/**
 * Convex surfaces thrown errors to the client as strings like:
 *   "[CONVEX A(agcAuth:repLogin)] Server Error\nUncaught Error: Invalid username or password"
 * or "Uncaught Error: ..." — strip the plumbing so users only see the friendly
 * message our actions intentionally throw.
 */
export type FriendlyError = {
  /** Short, human-readable headline for a toast title or inline alert. */
  title: string;
  /** Optional extra detail (e.g. field-level requirements) for the toast body. */
  detail?: string;
};

const CONVEX_PREFIX_RE =
  /^\s*\[CONVEX[^\]]*\]\s*(?:Server Error\s*)?(?:Uncaught Error:\s*)?/i;

/** Remove Convex error plumbing ("[CONVEX A(...)] Server Error Uncaught Error: "). */
export function cleanErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong. Please try again.";
  const cleaned = raw.replace(CONVEX_PREFIX_RE, "").trim();
  return cleaned || "Something went wrong. Please try again.";
}

/**
 * Map a thrown error to a friendly toast-friendly shape. Known auth/validation
 * messages get warmer copy; anything else is passed through with prefixes
 * stripped so it still makes sense.
 */
export function friendlyError(err: unknown): FriendlyError {
  const message = cleanErrorMessage(err);

  if (/invalid username or password/i.test(message)) {
    return {
      title: "We couldn't sign you in",
      detail:
        "Check your hub username and password, then try again. Usernames are the hub name in lowercase with underscores (e.g. ashanti_mampong).",
    };
  }
  if (/account has been disabled/i.test(message)) {
    return {
      title: "This account is disabled",
      detail: "Please contact the registration desk for help.",
    };
  }
  if (/reset link is invalid or has expired/i.test(message)) {
    return {
      title: "This reset link isn't valid anymore",
      detail: "Reset links expire after 3 hours — request a fresh one.",
    };
  }
  if (/password must be at least 8/i.test(message)) {
    return {
      title: "Password is too short",
      detail: "Please use at least 8 characters.",
    };
  }
  if (/already in use/i.test(message)) {
    return {
      title: "Email already registered",
      detail:
        "That email address is linked to another account. Try a different one.",
    };
  }
  if (/valid email address is required/i.test(message)) {
    return {
      title: "Check your email address",
      detail: "Please enter a valid email address.",
    };
  }
  if (/network|fetch failed|Failed to fetch/i.test(message)) {
    return {
      title: "Connection problem",
      detail: "We couldn't reach the server. Check your internet and retry.",
    };
  }

  // Unknown but intentional server message — pass it through, cleaned up.
  return { title: message };
}
