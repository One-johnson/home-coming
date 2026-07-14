"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { AdminRole } from "@/lib/adminRoles";

const STORAGE_KEY = "homecoming_admin_session";

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
  setSession: (token: string) => void;
  clearSession: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(
  null,
);

const UNAVAILABLE_SESSION: AdminSessionContextValue = {
  sessionToken: null,
  isReady: true,
  user: null,
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
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const logout = useMutation(api.users.logout);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setSessionToken(stored);
    } catch {
      setSessionToken(null);
    }
    setIsReady(true);
  }, []);

  const user = useQuery(
    api.users.currentUser,
    isReady && sessionToken ? { sessionToken } : "skip",
  );

  const setSession = useCallback((token: string) => {
    window.localStorage.setItem(STORAGE_KEY, token);
    setSessionToken(token);
  }, []);

  const clearSession = useCallback(async () => {
    const token = sessionToken;
    window.localStorage.removeItem(STORAGE_KEY);
    setSessionToken(null);
    if (token) {
      try {
        await logout({ sessionToken: token });
      } catch {
        // Session may already be expired.
      }
    }
  }, [logout, sessionToken]);

  useEffect(() => {
    if (!isReady || !sessionToken) return;
    if (user === null) {
      window.localStorage.removeItem(STORAGE_KEY);
      setSessionToken(null);
    }
  }, [isReady, sessionToken, user]);

  const value = useMemo(
    () => ({
      sessionToken,
      isReady,
      user: sessionToken ? user : null,
      setSession,
      clearSession,
    }),
    [sessionToken, isReady, user, setSession, clearSession],
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
