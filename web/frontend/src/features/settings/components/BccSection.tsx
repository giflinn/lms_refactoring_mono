import { useState } from "react";
import { SegmentedTabs } from "../../../components/ui/SegmentedTabs";
import { BccTransactionsTab } from "./BccTransactionsTab";
import { BccEventsTab } from "./BccEventsTab";

type SubTab = "transactions" | "events";
const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "transactions", label: "Транзакции" },
  { id: "events", label: "Журнал" },
];

export function BccSection() {
  const [sub, setSub] = useState<SubTab>("transactions");

  return (
    <section className="rounded-[12px] border border-[rgba(102,112,133,0.2)] bg-white p-6">
      <h2 className="mb-1 text-[16px] font-semibold text-[#0E131F]">
        BCC (оплата картой)
      </h2>
      <p className="mb-4 max-w-[640px] text-[13px] leading-[1.5] text-grey-medium">
        Транзакции картой и журнал всех событий BCC (запросы оплаты, входящие
        callback'и, возвраты) — для отладки. Только для админов; чувствительные
        поля (NONCE/P_SIGN) скрыты.
      </p>

      <SegmentedTabs<SubTab>
        tabs={SUB_TABS}
        value={sub}
        onChange={setSub}
        className="mb-5 self-start"
      />

      {sub === "transactions" ? <BccTransactionsTab /> : <BccEventsTab />}
    </section>
  );
}
