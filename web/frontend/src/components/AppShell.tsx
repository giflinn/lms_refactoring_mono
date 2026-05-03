import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ManagerDrawerProvider } from "../features/managers/ManagerDrawerContext";

export function AppShell() {
  return (
    <ManagerDrawerProvider>
      <div className="flex h-screen bg-background">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex min-h-0 flex-1 flex-col overflow-auto px-6 pb-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ManagerDrawerProvider>
  );
}
