import { type ComponentType, type SVGProps } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Logo } from "./Logo";
import { useAuth } from "../auth/AuthContext";
import IconHome from "../assets/icons/sidebar/home.svg?react";
import IconReports from "../assets/icons/sidebar/reports.svg?react";
import IconOrders from "../assets/icons/sidebar/orders.svg?react";
import IconCancellations from "../assets/icons/sidebar/cancellations.svg?react";
import IconNotifications from "../assets/icons/sidebar/notifications.svg?react";
import IconChats from "../assets/icons/sidebar/chats.svg?react";
import IconProducts from "../assets/icons/sidebar/products.svg?react";
import IconManagers from "../assets/icons/sidebar/managers.svg?react";
import IconClients from "../assets/icons/sidebar/clients.svg?react";
import IconCalendar from "../assets/icons/sidebar/calendar.svg?react";
import IconLogout from "../assets/icons/sidebar/logout.svg?react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  to: string;
  label: string;
  Icon: IconComponent;
  end?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Главная", Icon: IconHome, end: true },
  { to: "/reports", label: "Отчеты", Icon: IconReports },
  { to: "/orders", label: "Заказы", Icon: IconOrders },
  { to: "/cancellations", label: "Отмены", Icon: IconCancellations },
  { to: "/notifications", label: "Нотификации", Icon: IconNotifications },
  { to: "/chats", label: "Чаты", Icon: IconChats },
  { to: "/products", label: "Товары", Icon: IconProducts },
  { to: "/managers", label: "Менеджеры", Icon: IconManagers },
  { to: "/clients", label: "Клиенты", Icon: IconClients },
  { to: "/coach-calendar", label: "Календарь Коуча", Icon: IconCalendar },
];

const ICON_CLASS = "h-5 w-5 shrink-0";

export function Sidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col items-center gap-6 border-r border-[rgba(102,112,133,0.3)] bg-white pr-3 py-4 shadow-[6px_6px_27px_rgba(0,0,0,0.05)]">
      <Logo />
      <nav className="flex w-full flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavItemRow key={item.to} item={item} />
        ))}
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-[208px] cursor-pointer items-center justify-end"
      >
        <div className="flex w-[192px] items-center gap-2 rounded-[8px] px-3 py-2.5 text-grey-dark hover:bg-grey-lighter transition-colors">
          <IconLogout className={ICON_CLASS} />
          <span className="text-[14px] font-medium leading-5">Выйти</span>
        </div>
      </button>
    </aside>
  );
}

function NavItemRow({ item }: { item: NavItem }) {
  const { Icon } = item;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className="relative flex w-[208px] items-center justify-end"
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute left-0 top-1/2 h-[40px] w-1 -translate-y-1/2 rounded-r-[8px] bg-purple-primary" />
          )}
          <div
            className={clsx(
              "flex w-[192px] items-center gap-2 rounded-[8px] px-3 py-2.5 transition-colors",
              isActive
                ? "bg-purple-primary text-white"
                : "text-grey-dark hover:bg-grey-lighter",
            )}
          >
            <Icon className={ICON_CLASS} />
            <span className="flex-1 text-[14px] font-medium leading-5">
              {item.label}
            </span>
          </div>
        </>
      )}
    </NavLink>
  );
}
