"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { repSessionStore, useSessionToken } from "@/lib/sessionStore";
import { isSessionExpired } from "@/lib/friendlyError";

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
  /**
   * True if `err` means the session expired/was revoked — in that case the
   * session is cleared and a friendly toast shown, so callers can just
   * `if (handleSessionError(err)) return;` inside their catch blocks.
   */
  handleSessionError: (err: unknown) => boolean;
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
  handleSessionError: () => false,
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
  const sessionToken = useSessionToken(repSessionStore);
  const logout = useMutation(api.agcPortal.logoutRep);

  // "Ready" once mounted: after hydration the store snapshot is authoritative
  // (it returns null on the server and the stored value on the client).
  const isReady = true;

  const rep = useQuery(
    api.agcPortal.getRepProfile,
    sessionToken ? { sessionToken } : "skip",
  );

  const setSession = useCallback((token: string) => {
    repSessionStore.set(token);
  }, []);

  const clearSession = useCallback(async () => {
    const token = sessionToken;
    repSessionStore.clear();
    if (token) {
      try {
        await logout({ sessionToken: token });
      } catch {
        // Session may already be expired.
      }
    }
  }, [logout, sessionToken]);

  // Mid-action session expiry: bounce to sign-in with a friendly toast
  // instead of leaving the rep stuck on a page whose every action fails.
  const handleSessionError = useCallback(
    (err: unknown): boolean => {
      if (!isSessionExpired(err)) return false;
      void clearSession();
      toast.info("Your session has expired", {
        description: "Please sign in again to continue.",
      });
      return true;
    },
    [clearSession],
  );

  const value = useMemo(
    () => ({
      sessionToken,
      isReady,
      rep: sessionToken ? rep : null,
      setSession,
      clearSession,
      handleSessionError,
    }),
    [sessionToken, isReady, rep, setSession, clearSession, handleSessionError],
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
