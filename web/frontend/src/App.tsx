import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireGuest } from "./auth/guards";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { StubPage } from "./pages/StubPage";
import { ManagersPage } from "./features/managers/pages/ManagersPage";
import { ClientsPage } from "./features/clients/pages/ClientsPage";
import { ProductsPage } from "./features/products/pages/ProductsPage";
import { CoachCalendarPage } from "./features/coachCalendar/pages/CoachCalendarPage";
import { ChatsPage } from "./features/chat/pages/ChatsPage";
import { NotificationsPage } from "./features/notifications/pages/NotificationsPage";
import { OrdersPage } from "./features/orders/pages/OrdersPage";

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
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/cancellations" element={<StubPage title="Отмены" />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/managers" element={<ManagersPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/coach-calendar" element={<CoachCalendarPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
