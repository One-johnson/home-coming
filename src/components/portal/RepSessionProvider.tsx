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

const STORAGE_KEY = "homecoming_rep_session";

export type RepProfile = {
  _id: string;
  username: string;
  hubId: string;
  hubName: string;
  hubRegion: string;
  country: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileComplete: boolean;
  createdAt: number;
};

type RepSessionContextValue = {
  sessionToken: string | null;
  isReady: boolean;
  rep: RepProfile | null | undefined;
  setSession: (token: string) => void;
  clearSession: () => Promise<void>;
};

const RepSessionContext = createContext<RepSessionContextValue | null>(null);

const UNAVAILABLE_SESSION: RepSessionContextValue = {
  sessionToken: null,
  isReady: true,
  rep: null,
  setSession: () => {
    throw new Error("Rep session is unavailable without Convex configured.");
  },
  clearSession: async () => {},
};

export function RepSessionFallbackProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RepSessionContext.Provider value={UNAVAILABLE_SESSION}>
      {children}
    </RepSessionContext.Provider>
  );
}

export function RepSessionProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const logout = useMutation(api.agcPortal.logoutRep);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setSessionToken(stored);
    } catch {
      setSessionToken(null);
    }
    setIsReady(true);
  }, []);

  const rep = useQuery(
    api.agcPortal.getRepProfile,
    isReady && sessionToken ? { sessionToken } : "skip",
  );

  const setSession = useCallback((token: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // Storage may be unavailable (private mode, quota) — keep the in-memory
      // session so the current tab still works.
    }
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
    if (rep === null) {
      window.localStorage.removeItem(STORAGE_KEY);
      setSessionToken(null);
    }
  }, [isReady, sessionToken, rep]);

  const value = useMemo(
    () => ({
      sessionToken,
      isReady,
      rep: sessionToken ? rep : null,
      setSession,
      clearSession,
    }),
    [sessionToken, isReady, rep, setSession, clearSession],
  );

  return (
    <RepSessionContext.Provider value={value}>
      {children}
    </RepSessionContext.Provider>
  );
}

export function useRepSession() {
  const ctx = useContext(RepSessionContext);
  if (!ctx) {
    throw new Error("useRepSession must be used within RepSessionProvider");
  }
  return ctx;
}

/** Merge sessionToken into Convex query/mutation args when a session exists. */
export function useRepSessionArgs<T extends Record<string, unknown>>(args?: T) {
  const { sessionToken, isReady } = useRepSession();
  if (!isReady || !sessionToken) return "skip" as const;
  return { ...(args ?? {}), sessionToken } as T & { sessionToken: string };
}
