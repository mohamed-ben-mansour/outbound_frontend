import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Lightweight workspace identity. The backend has no auth — a user_id is the
 * only identity, and it scopes every table (campaigns, params, blacklist…).
 * Persisted to localStorage so a refresh keeps you in the same workspace.
 */

const STORAGE_KEY = "nudge_console_user_id";

interface WorkspaceContextValue {
  userId: string;
  setUserId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? "user-1";
    } catch {
      return "user-1";
    }
  });

  const setUserId = (id: string) => {
    const clean = id.trim();
    setUserIdState(clean || "user-1");
    try {
      localStorage.setItem(STORAGE_KEY, clean || "user-1");
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, userId);
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
