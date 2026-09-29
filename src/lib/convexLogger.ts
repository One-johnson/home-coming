/**
 * Convex echoes every rejected server function to console.error, e.g.
 *   "[CONVEX A(agcAuth:repLogin)] [Request ID: ...] Server Error ..."
 * even when the rejection is intentional (bad password, deadline passed,
 * locked booking…) and the UI already caught it and showed a friendly toast.
 * The Next.js dev overlay surfaces those echoes as scary "Console Error"
 * entries, which reads like the app is broken when it isn't.
 *
 * This logger keeps all normal Convex logging but demotes those server-error
 * echoes to console.debug — still visible in devtools verbose mode, but no
 * longer flagged as errors. The intentional message itself is mapped to
 * human copy by src/lib/friendlyError.ts.
 */
const SERVER_ERROR_ECHO_RE = /^\[CONVEX [A-Z]+\([^)]*\)\].*\bServer Error\b/;

function isServerErrorEcho(args: unknown[]): boolean {
  const first = args[0];
  return typeof first === "string" && SERVER_ERROR_ECHO_RE.test(first);
}

export const convexLogger = {
  logVerbose: () => {
    // Verbose protocol noise is never useful in the browser console.
  },
  log: (...args: unknown[]) => {
    console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (isServerErrorEcho(args)) {
      console.debug("[convex]", ...args);
      return;
    }
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (isServerErrorEcho(args)) {
      // Intentional server rejection — the UI handles it; keep a debug trail.
      console.debug("[convex]", ...args);
      return;
    }
    console.error(...args);
  },
};
