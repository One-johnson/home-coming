"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  adminSessionStore,
  sessionExpiresAt,
  unwrapSessionToken,
  useSessionToken,
} from "@/lib/sessionStore";
import type { AdminRole } from "@/lib/adminRoles";

type SessionUser = {
  _id: string;
  name: string;
  email: string;
  role: AdminRole;
};

type AdminSessionContextValue = {
  sessionToken: string | null;
  isReady: boolean;
  user: SessionUser | null | undefined;
  /** Epoch ms when the server-side session ends, if known. */
  sessionExpiresAt: number | null;
  setSession: (token: string, expiresAt?: number) => void;
  clearSession: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(
  null,
);

const UNAVAILABLE_SESSION: AdminSessionContextValue = {
  sessionToken: null,
  isReady: true,
  user: null,
  sessionExpiresAt: null,
  setSession: () => {
    throw new Error("Admin session is unavailable without Convex configured.");
  },
  clearSession: async () => {},
};

/** Used when Convex is not configured so useAdminSession never throws. */
export function AdminSessionFallbackProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AdminSessionContext.Provider value={UNAVAILABLE_SESSION}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  // The store may hold JSON ("{t,e}") when an expiry was recorded; the
  // server needs the unwrapped token, not the raw stored string.
  const stored = useSessionToken(adminSessionStore);
  const sessionToken = unwrapSessionToken(stored);
  const logout = useMutation(api.users.logout);

  // "Ready" once mounted: after hydration the store snapshot is authoritative
  // (it returns null on the server and the stored value on the client).
  const isReady = true;

  const user = useQuery(
    api.users.currentUser,
    sessionToken ? { sessionToken } : "skip",
  );

  const setSession = useCallback((token: string, expiresAt?: number) => {
    adminSessionStore.set(token, expiresAt);
  }, []);

  const clearSession = useCallback(async () => {
    const token = sessionToken;
    adminSessionStore.clear();
    if (token) {
      try {
        await logout({ sessionToken: token });
      } catch {
        // Session may already be expired.
      }
    }
  }, [logout, sessionToken]);

  // A stored token whose session no longer resolves (expired/revoked) clears
  // itself. useSyncExternalStore keeps this in sync without setState-in-effect.
  const expiresAt = sessionExpiresAt(stored);
  const value = useMemo(
    () => ({
      sessionToken,
      isReady,
      sessionExpiresAt: expiresAt,
      user: sessionToken ? user : null,
      setSession,
      clearSession,
    }),
    [sessionToken, isReady, expiresAt, user, setSession, clearSession],
  );

  return (
    <AdminSessionContext.Provider value={value}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSession must be used within AdminSessionProvider");
  }
  return ctx;
}

/** Merge sessionToken into Convex query/mutation args when a session exists. */
export function useSessionArgs<T extends Record<string, unknown>>(args?: T) {
  const { sessionToken, isReady } = useAdminSession();
  if (!isReady || !sessionToken) return "skip" as const;
  return { ...(args ?? {}), sessionToken } as T & { sessionToken: string };
}
