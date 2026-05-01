import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "./Avatar";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Главная",
  "/reports": "Отчеты",
  "/orders": "Заказы",
  "/cancellations": "Отмены",
  "/notifications": "Нотификации",
  "/chats": "Чаты",
  "/products": "Товары",
  "/managers": "Менеджеры",
  "/clients": "Клиенты",
  "/coach-calendar": "Календарь Коуча",
};

function titleFor(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  // Match the longest known prefix for nested routes (e.g. /managers/123).
  const match = Object.keys(ROUTE_TITLES)
    .filter((p) => p !== "/" && pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_TITLES[match] : "";
}

export function Header() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const title = titleFor(pathname);

  return (
    <header className="flex items-center justify-between p-6">
      <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.1143px] text-[#0E131F]">
        {title}
      </h1>
      <Avatar
        src={user?.avatarUrl}
        firstName={user?.firstName}
        lastName={user?.lastName}
        email={user?.email}
        size={60}
      />
    </header>
  );
}
