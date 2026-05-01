import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  BarChart3,
  ShoppingCart,
  XCircle,
  Bell,
  MessageSquare,
  Tag,
  Briefcase,
  Users,
  Calendar,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import { Logo } from "./Logo";
import { useAuth } from "../auth/AuthContext";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Главная", icon: Home, end: true },
  { to: "/reports", label: "Отчеты", icon: BarChart3 },
  { to: "/orders", label: "Заказы", icon: ShoppingCart },
  { to: "/cancellations", label: "Отмены", icon: XCircle },
  { to: "/notifications", label: "Нотификации", icon: Bell },
  { to: "/chats", label: "Чаты", icon: MessageSquare },
  { to: "/products", label: "Товары", icon: Tag },
  { to: "/managers", label: "Менеджеры", icon: Briefcase },
  { to: "/clients", label: "Клиенты", icon: Users },
  { to: "/coach-calendar", label: "Календарь Коуча", icon: Calendar },
];

export function Sidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="flex h-screen w-[268px] shrink-0 flex-col items-center gap-10 border-r border-[rgba(102,112,133,0.3)] bg-white pr-6 py-6 shadow-[6px_6px_27px_rgba(0,0,0,0.05)]">
      <Logo />
      <nav className="flex w-full flex-1 flex-col gap-4">
        {NAV_ITEMS.map((item) => (
          <NavItemRow key={item.to} item={item} />
        ))}
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-[244px] cursor-pointer items-center justify-end"
      >
        <div className="flex w-[220px] items-center gap-2 rounded-[8px] px-6 py-4 hover:bg-grey-lighter transition-colors">
          <LogOut size={24} strokeWidth={1.5} className="text-grey-dark" />
          <span className="text-[16px] font-medium leading-6 text-grey-dark">
            Выйти
          </span>
        </div>
      </button>
    </aside>
  );
}

function NavItemRow({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className="flex w-[244px] items-center justify-end"
    >
      {({ isActive }) => (
        <>
          <div
            className={clsx(
              "h-[56px] w-1 shrink-0 rounded-r-[8px]",
              isActive ? "bg-purple-primary" : "bg-transparent",
            )}
          />
          <div
            className={clsx(
              "flex w-[220px] items-center gap-2 rounded-[8px] px-6 py-4 transition-colors",
              isActive
                ? "bg-purple-primary text-white"
                : "text-grey-dark hover:bg-grey-lighter",
            )}
          >
            <Icon
              size={24}
              strokeWidth={1.5}
              className={isActive ? "text-white" : "text-grey-dark"}
            />
            <span className="flex-1 text-[16px] font-medium leading-6">
              {item.label}
            </span>
          </div>
        </>
      )}
    </NavLink>
  );
}
