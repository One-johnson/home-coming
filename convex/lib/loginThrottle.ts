/**
 * Login throttle for representative sign-in (brute-force lockout).
 *
 * Protects the shared temp-password window: after MAX_FAILURES failed
 * sign-in attempts for the same username within WINDOW_MS, the username is
 * locked for LOCK_MS and further attempts are rejected even with the right
 * password. Cleanup is lazy on touch — the table stays small because every
 * mutation first deletes stale rows.
 */

export const MAX_FAILURES = 5;
export const WINDOW_MS = 1000 * 60 * 15; // 15-minute rolling window
export const LOCK_MS = 1000 * 60 * 15; // 15-minute lockout

/** Friendly message thrown while a username is locked out. */
export const LOCK_MESSAGE =
  "Too many failed attempts. For security, this account is locked for 15 minutes — please try again later.";

/**
 * Throttle keys are normalized usernames. Both login and first-time setup
 * verify passwords for the same accounts, so they share the same throttle
 * namespace (prefix kept for clarity/debuggability).
 */
export function throttleKey(username: string): string {
  return username.trim().toLowerCase();
}
