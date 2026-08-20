import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";

/**
 * Workspace identity context.
 *
 * The user_id is the only identity, and it scopes every table (campaigns,
 * params, blacklist…).  Now derived from the authenticated user rather than
 * a free-text input — the user_id stored in the JWT is the source of truth.
 *
 * Legacy localStorage key is kept for backwards-compat but no longer
 * drives the default when an authenticated user is present.
 */

const LEGACY_STORAGE_KEY = "nudge_console_user_id";

interface WorkspaceContextValue {
  userId: string;
  setUserId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Prefer the authenticated user's ID; fall back to localStorage for
  // unauthenticated or transitional states.
  const [userId, setUserIdState] = useState<string>(() => {
    if (user?.userId) return user.userId;
    try {
      return localStorage.getItem(LEGACY_STORAGE_KEY) ?? "user-1";
    } catch {
      return "user-1";
    }
  });

  // When the auth user changes (login/logout), sync the workspace userId
  useEffect(() => {
    if (user?.userId) {
      setUserIdState(user.userId);
    }
  }, [user?.userId]);

  const setUserId = (id: string) => {
    const clean = id.trim();
    setUserIdState(clean || "user-1");
    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, clean || "user-1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, userId);
    } catch {
      /* ignore */
    }
  }, [userId]);

  return (
    <WorkspaceContext.Provider value={{ userId, setUserId }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
