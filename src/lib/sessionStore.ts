"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * A tiny external store backed by localStorage, for use with
 * useSyncExternalStore. Reads stay SSR-safe, writes notify every hook in
 * this tab, and cross-tab changes arrive via the `storage` event — replacing
 * the setState-in-effect bootstrap pattern that react-hooks v6 warns about.
 */
class LocalValueStore {
  private cached: string | null;
  private readonly listeners = new Set<() => void>();
  private bound = false;

  constructor(private readonly key: string) {
    this.cached = this.read();
  }

  private read(): string | null {
    try {
      return window.localStorage.getItem(this.key);
    } catch {
      // Storage unavailable (private mode, quota) — behave as signed out.
      return null;
    }
  }

  private bind() {
    if (this.bound || typeof window === "undefined") return;
    this.bound = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== this.key && event.key !== null) return;
      this.cached = this.read();
      for (const listener of this.listeners) listener();
    });
  }

  getSnapshot = (): string | null => {
    this.bind();
    return this.cached;
  };

  getServerSnapshot = (): string | null => null;

  subscribe = (listener: () => void): (() => void) => {
    this.bind();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Persist a token (optionally with its expiry) and notify subscribers. */
  set(token: string, expiresAt?: number) {
    // Expiry-aware sessions are stored as JSON; bare tokens stay bare so
    // existing localStorage entries keep working after an upgrade.
    const stored =
      typeof expiresAt === "number"
        ? JSON.stringify({ t: token, e: expiresAt })
        : token;
    this.cached = stored;
    for (const listener of this.listeners) listener();
    try {
      window.localStorage.setItem(this.key, stored);
    } catch {
      // Keep the in-memory session even if persistence fails.
    }
  }

  /** Remove the token and notify subscribers in this tab. */
  clear() {
    this.cached = null;
    for (const listener of this.listeners) listener();
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // Ignore storage failures on sign-out.
    }
  }
}

export const adminSessionStore = new LocalValueStore(
  "homecoming_admin_session",
);
export const repSessionStore = new LocalValueStore("homecoming_rep_session");

/**
 * Read the expiry (epoch ms) recorded alongside a stored session, if any.
 * Returns null for legacy bare-token entries and missing sessions.
 */
export function sessionExpiresAt(raw: string | null): number | null {
  if (!raw || !raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as { t?: string; e?: number };
    return typeof parsed.e === "number" ? parsed.e : null;
  } catch {
    return null;
  }
}

/**
 * Extract the actual session token from a stored value. Expiry-aware
 * entries hold JSON ("{\"t\":…,\"e\":…}") — callers must unwrap before
 * sending the token to the server, or every lookup misses and the user
 * is bounced to sign-in despite a perfectly valid session.
 */
export function unwrapSessionToken(raw: string | null): string | null {
  if (!raw || !raw.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(raw) as { t?: string };
    return typeof parsed.t === "string" ? parsed.t : null;
  } catch {
    return null;
  }
}

/**
 * Hook that tracks one of the stores above. Returns the token (or null) and
 * is hydration-safe: the server snapshot is always null, so the first client
 * render matches SSR and re-renders once the real value is known.
 */
export function useSessionToken(store: LocalValueStore): string | null {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}

/** setTimeout overflows past ~24.8 days and would fire at once; cap the wait. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Run `onExpire` when `expiresAt` passes. Convex queries cache Date.now(), so
 * a long-open tab never learns from the server alone that its session ended;
 * this timer signs it out on time. Long waits re-arm until the real expiry.
 */
export function useExpireAt(expiresAt: number | null, onExpire: () => void) {
  useEffect(() => {
    if (expiresAt === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const left = expiresAt - Date.now();
      if (left <= 0) {
        onExpire();
        return;
      }
      timer = setTimeout(arm, Math.min(left, MAX_TIMEOUT_MS));
    };
    arm();
    return () => clearTimeout(timer);
  }, [expiresAt, onExpire]);
}
