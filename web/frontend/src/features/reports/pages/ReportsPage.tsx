import { useState } from "react";
import clsx from "clsx";
import { ManagersTab } from "../components/ManagersTab";
import { SalesTab } from "../components/SalesTab";
import { NewClientsTab } from "../components/NewClientsTab";

type TabId = "managers" | "sales" | "new-clients";

const TABS: { id: TabId; label: string }[] = [
  { id: "managers", label: "Менеджеры" },
  { id: "sales", label: "Продажи" },
  { id: "new-clients", label: "Новые клиенты" },
];

export function ReportsPage() {
  const [active, setActive] = useState<TabId>("managers");

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div className="flex border-b border-[#EAECF0]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={clsx(
              "-mb-px cursor-pointer border-b-2 px-4 py-3 text-[14px] font-medium transition-colors",
              active === t.id
                ? "border-purple-primary text-purple-primary"
                : "border-transparent text-grey-medium hover:text-grey-dark",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === "managers" && <ManagersTab />}
      {active === "sales" && <SalesTab />}
      {active === "new-clients" && <NewClientsTab />}
    </div>
  );
}
