import { useState } from "react";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
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
      <SegmentedTabs<TabId>
        tabs={TABS}
        value={active}
        onChange={setActive}
        className="self-start"
      />
      {active === "managers" && <ManagersTab />}
      {active === "sales" && <SalesTab />}
      {active === "new-clients" && <NewClientsTab />}
    </div>
  );
}
