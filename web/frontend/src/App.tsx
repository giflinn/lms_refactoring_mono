import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireGuest } from "./auth/guards";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { StubPage } from "./pages/StubPage";
import { ManagersPage } from "./features/managers/pages/ManagersPage";
import { ClientsPage } from "./features/clients/pages/ClientsPage";

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
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<StubPage title="Главная" />} />
          <Route path="/reports" element={<StubPage title="Отчеты" />} />
          <Route path="/orders" element={<StubPage title="Заказы" />} />
          <Route path="/cancellations" element={<StubPage title="Отмены" />} />
          <Route
            path="/notifications"
            element={<StubPage title="Нотификации" />}
          />
          <Route path="/chats" element={<StubPage title="Чаты" />} />
          <Route path="/products" element={<StubPage title="Товары" />} />
          <Route path="/managers" element={<ManagersPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route
            path="/coach-calendar"
            element={<StubPage title="Календарь Коуча" />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
