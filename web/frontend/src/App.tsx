import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireGuest } from "./auth/guards";
import { LoginPage } from "./pages/LoginPage";
import { HomeStubPage } from "./pages/HomeStubPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <RequireGuest>
              <LoginPage />
            </RequireGuest>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomeStubPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
