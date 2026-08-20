import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { authLogout, authMe, type AuthUserInfo } from "@/lib/api";

/**
 * Authentication context — cookie-based session management.
 *
 * The JWT lives in an httpOnly cookie set by the backend.  On app load we
 * call GET /auth/me (which reads the cookie server-side) to restore the
 * user session.  No token is stored client-side.
 */

interface AuthContextValue {
  /** Current user info (null when logged out or while loading). */
  user: AuthUser | null;
  /** True while the initial /auth/me check is in flight. */
  isLoading: boolean;
  /** Store user info after a successful login. */
  login: (user: AuthUser) => void;
  /** Clear session (calls POST /auth/logout then clears local state). */
  logout: () => Promise<void>;
}

export interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Map the API response shape to our AuthUser. */
function toAuthUser(u: AuthUserInfo): AuthUser {
  return {
    userId: u.user_id,
    email: u.email,
    displayName: u.display_name,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // true until /auth/me resolves

  // On mount: call /auth/me to check if there's a valid cookie session
  useEffect(() => {
    authMe()
      .then((data) => setUser(toAuthUser(data)))
      .catch(() => setUser(null)) // not logged in or cookie expired
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((newUser: AuthUser) => {
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authLogout(); // clears the httpOnly cookie server-side
    } catch {
      // ignore — cookie may already be gone
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
