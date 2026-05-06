import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-grey-medium">
      Загрузка…
    </div>
  );
}

/** Renders children only when an authenticated staff user exists; otherwise redirects to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Inverse: redirects already-signed-in users away from auth pages (e.g. /login). */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * Renders children only when the authenticated user has the `admin` role.
 * Anything else (senior_manager, missing user) is bounced to the home page —
 * not /login, since those users *are* authenticated, just not allowed here.
 * The sidebar entry for admin-only pages is also hidden so this is a defense-
 * in-depth guard, not the primary UX.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
