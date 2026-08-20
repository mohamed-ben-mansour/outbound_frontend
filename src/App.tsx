import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Campaigns from "@/pages/Campaigns";
import CampaignDetail from "@/pages/CampaignDetail";
import { useAuth } from "@/context/AuthContext";
import { setOnAuthFailure } from "@/lib/api";

/**
 * RequireAuth — wraps routes that need a logged-in user.
 * Redirects to /login when unauthenticated (or while session is still loading).
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  // Show nothing (or a spinner) while the initial /auth/me check is in flight
  // to avoid a flash of the login page on reload.
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Register the 401 handler: on any backend 401, clear auth and redirect
  useEffect(() => {
    setOnAuthFailure(() => {
      logout();
      navigate("/login", { replace: true });
    });
    return () => setOnAuthFailure(null);
  }, [logout, navigate]);

  return (
    <Routes>
      {/* Public route: login / register */}
      <Route path="/login" element={<Login />} />

      {/* Protected routes */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/:campaignId" element={<CampaignDetail />} />
      </Route>

      {/* Catch-all → redirect to home (which will redirect to login if needed) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
