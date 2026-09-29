import { ConvexError } from "convex/values";

/**
 * Convex surfaces thrown errors to the client as strings like:
 *   "[CONVEX A(agcAuth:repLogin)] Server Error\nUncaught Error: Invalid username or password"   (old format)
 *   "[Request ID: 96a6d283e177e540] Server Error\nUncaught Error: The registration deadline has passed.\nCalled by client"   (current format)
 * Some layers also wrap intentional messages in ConvexError({ message }).
 * Strip all the plumbing so users only see the friendly message our
 * functions intentionally throw.
 */
export type FriendlyError = {
  /** Short, human-readable headline for a toast title or inline alert. */
  title: string;
  /** Optional extra detail (e.g. field-level requirements) for the toast body. */
  detail?: string;
};

/** Extract the raw message string from anything throwable. */
function rawErrorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data: unknown = err.data;
    if (typeof data === "string" && data.trim()) return data;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
    ) {
      return (data as { message: string }).message;
    }
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

const CONVEX_NOISE_PATTERNS: RegExp[] = [
  // Old format: "[CONVEX A(agcAuth:repLogin)] Server Error"
  /^\s*\[CONVEX[^\]]*\]\s*/i,
  // Current format: "[Request ID: 96a6d283e177e540]"
  /^\s*\[Request ID:\s*[^\]]*\]\s*/i,
  // "Server Error", "Client Error" — leading severity labels
  /^\s*(?:Server|Client)\s*Error\s*:?\s*/i,
  // "Uncaught Error:", "Uncaught TypeError:" etc.
  /^\s*Uncaught\s+\w*(?:Error|Exception)\s*:\s*/i,
  // "Called by client" trailer
  /\s*Called by (?:client|server)\s*$/i,
];

/** Recursively strip Convex plumbing from a raw error string. */
export function cleanErrorMessage(err: unknown): string {
  let text = rawErrorMessage(err);
  for (let i = 0; i < 3; i += 1) {
    const before = text;
    for (const pattern of CONVEX_NOISE_PATTERNS) {
      text = text.replace(pattern, "");
    }
    if (text === before) break;
  }
  text = text.trim();
  // If what remains is still obviously plumbing (raw JS crash text like
  // "Cannot read properties of undefined (reading 'total')"), hide it —
  // a stack-frame toast is worse than a short honest fallback.
  const TECHNICAL_CRASH_RE =
    /cannot read propert(y|ies)\b|is not a function\b|is not defined\b|is not a constructor\b|is not iterable\b|cannot destructure\b|\(reading '/i;
  if (/^\s*(Error|TypeError|RangeError)\b/.test(text) || TECHNICAL_CRASH_RE.test(text)) {
    return "Something went wrong. Please try again.";
  }
  return text || "Something went wrong. Please try again.";
}

/** Session expired mid-action → send the rep back to sign-in. */
export function isSessionExpired(err: unknown): boolean {
  return /unauthorized/i.test(cleanErrorMessage(err));
}

/** Structured payload attached to ConvexError throws (e.g. agcAuth lockouts). */
export function extractErrorData(err: unknown): Record<string, unknown> | null {
  if (err instanceof ConvexError && err.data && typeof err.data === "object") {
    return err.data as Record<string, unknown>;
  }
  return null;
}

export type LoginErrorInfo = {
  /** Failures left before the 15-minute lock engages (invalid-credentials throws). */
  attemptsRemaining?: number;
  /** Epoch ms when the current lockout lifts (locked throws). */
  lockedUntil?: number;
};

/** Pull lockout metadata out of a sign-in error, if the server sent it. */
export function loginErrorInfo(err: unknown): LoginErrorInfo {
  const data = extractErrorData(err);
  if (!data) return {};
  const info: LoginErrorInfo = {};
  if (typeof data.attemptsRemaining === "number") {
    info.attemptsRemaining = data.attemptsRemaining;
  }
  if (typeof data.lockedUntil === "number") {
    info.lockedUntil = data.lockedUntil;
  }
  return info;
}

const mappings: Array<{
  test: RegExp;
  title: string;
  detail: string;
}> = [
  {
    test: /invalid username or password/i,
    title: "We couldn't sign you in",
    detail:
      "Check your hub username and password, then try again. Usernames are the hub name in lowercase with underscores (e.g. ashanti_mampong).",
  },
  {
    test: /account has been disabled|not active yet/i,
    title: "This account is not active",
    detail: "Please contact the registration desk for help.",
  },
  {
    test: /unauthorized/i,
    title: "Your session has expired",
    detail: "Please sign in again to continue.",
  },
  {
    test: /too many failed attempts/i,
    title: "Too many failed attempts",
    detail:
      "For security this account is locked for 15 minutes. Try again later, or contact the registration desk if you've lost the password.",
  },
  {
    test: /reset link is invalid or has expired/i,
    title: "This reset link isn't valid anymore",
    detail: "Reset links expire after 3 hours — request a fresh one.",
  },
  {
    test: /password must be at least 8/i,
    title: "Password is too short",
    detail: "Please use at least 8 characters.",
  },
  {
    test: /already in use/i,
    title: "Email already registered",
    detail:
      "That email address is linked to another account. Try a different one.",
  },
  {
    test: /valid email address is required/i,
    title: "Check your email address",
    detail: "Please enter a valid email address.",
  },
  {
    test: /registration deadline has passed/i,
    title: "The deadline has passed",
    detail:
      "Registrations are closed. Contact the registration desk for assistance.",
  },
  {
    test: /only reservations that are still on hold/i,
    title: "This booking can't be changed anymore",
    detail:
      "Payment was already confirmed, so the booking is locked. Contact the accommodation desk for any changes.",
  },
  {
    test: /hold window for this reservation has expired/i,
    title: "This reservation's hold has expired",
    detail: "Create a new booking — the held beds were returned to the pool.",
  },
  {
    test: /no longer receive a payment submission/i,
    title: "This booking can't receive a payment anymore",
    detail:
      "The hold may have expired or the payment was already processed. Check the booking status and try again.",
  },
  {
    test: /not enough capacity|sold out/i,
    title: "Not enough capacity",
    detail: "Some of the selected accommodation is fully booked. Try fewer guests or another type.",
  },
  {
    test: /network|fetch failed|Failed to fetch/i,
    title: "Connection problem",
    detail: "We couldn't reach the server. Check your internet and retry.",
  },
];

/**
 * Map a thrown error to a friendly toast-friendly shape. Known auth/validation
 * messages get warmer copy; anything else is passed through with prefixes
 * stripped so it still makes sense.
 */
export function friendlyError(err: unknown): FriendlyError {
  const message = cleanErrorMessage(err);
  for (const mapping of mappings) {
    if (mapping.test.test(message)) {
      return { title: mapping.title, detail: mapping.detail };
    }
  }
  // Unknown but intentional server message — pass it through, cleaned up.
  return { title: message };
}

/**
 * Spread-friendly helper for catch blocks:
 *   toast.error(...toastFriendlyErrorParts(err, "X failed"));
 * or pull just the message:
 *   const message = toastFriendlyErrorParts.toastMessage(err, "X failed");
 */
export const toastFriendlyErrorParts = Object.assign(
  (err: unknown, fallback: string): [string, { description?: string }] => {
    const { title, detail } = adminFriendlyError(err);
    return [title || fallback, detail ? { description: detail } : {}];
  },
  {
    toastMessage(err: unknown, fallback: string): string {
      const { title, detail } = adminFriendlyError(err);
      return detail ? `${title}: ${detail}` : title || fallback;
    },
  },
);

/**
 * One-liner for catch blocks: shows a friendly sonner toast and returns a
 * message string suitable for inline error state.
 */
export function toastFriendlyError(
  toastApi: { error: (title: string, opts?: { description?: string }) => void },
  err: unknown,
): string {
  const { title, detail } = adminFriendlyError(err);
  toastApi.error(title, { description: detail });
  return detail ? `${title}: ${detail}` : title;
}

/** Friendly error for admin surfaces: raw message for the inline alert, title+detail for the toast. */
export function adminFriendlyError(err: unknown): FriendlyError {
  const message = cleanErrorMessage(err);
  const lockout = mappings.find((m) => m.test.test(message));
  if (lockout && /too many failed attempts/i.test(message)) {
    return {
      title: lockout.title,
      detail:
        "For security this account is locked for 15 minutes. Try again later.",
    };
  }
  return { title: message };
}
