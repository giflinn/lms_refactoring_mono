import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Avatar } from "./Avatar";
import { useManagerDrawer } from "../features/managers/ManagerDrawerContext";
import type { Manager } from "../features/managers/api";
import type { User } from "../auth/api";

function userToManager(u: User): Manager {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    comment: u.comment,
    managerCode: u.managerCode,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
  };
}

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
  const { openEdit } = useManagerDrawer();
  const title = titleFor(pathname);

  return (
    <header className="flex items-center justify-between px-6 py-4">
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.1143px] text-[#0E131F]">
        {title}
      </h1>
      <button
        type="button"
        onClick={() => user && openEdit(userToManager(user))}
        disabled={!user}
        aria-label="Открыть профиль"
        className="rounded-full transition-opacity enabled:cursor-pointer enabled:hover:opacity-80 disabled:cursor-default"
      >
        <Avatar
          src={user?.avatarUrl}
          firstName={user?.firstName}
          lastName={user?.lastName}
          email={user?.email}
          size={40}
        />
      </button>
    </header>
  );
}
