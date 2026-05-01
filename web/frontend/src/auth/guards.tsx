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
