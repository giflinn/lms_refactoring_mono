import { useMemo, useState } from "react";
import { useSalesChart, useSummary, useTopProducts } from "../queries";
import { IndicatorCard } from "../components/IndicatorCard";
import { SalesChart } from "../components/SalesChart";
import { TopProductsTable } from "../components/TopProductsTable";
import { DateRangePicker } from "../components/DateRangePicker";
import { formatTengeCompact, toIsoDate } from "../format";
import IconClients from "../../../assets/icons/dashboard/clients.svg";
import IconGraphUp from "../../../assets/icons/dashboard/graph-up.svg";
import IconMoney from "../../../assets/icons/dashboard/money.svg";
import IconManagers from "../../../assets/icons/dashboard/managers.svg";

// Default to the trailing 12 months — matches the Figma "Янв … Дек" axis
// and gives the chart a non-trivial number of buckets out of the gate.
function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  return { from, to };
}

export function DashboardPage() {
  const [range, setRange] = useState(defaultRange);
  const fromIso = useMemo(() => toIsoDate(range.from), [range.from]);
  const toIso = useMemo(() => toIsoDate(range.to), [range.to]);

  const summary = useSummary();
  const chart = useSalesChart(fromIso, toIso);
  const top = useTopProducts(fromIso, toIso);

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="flex items-center justify-end">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <IndicatorCard
          label="Всего клиентов"
          value={summary.data?.totalClients.value ?? "—"}
          growthPct={summary.data?.totalClients.growthPct ?? null}
          iconUrl={IconClients}
          iconBg="rgba(250, 137, 5, 0.1)"
        />
        <IndicatorCard
          label="Всего продаж"
          value={summary.data?.totalSales.value ?? "—"}
          growthPct={summary.data?.totalSales.growthPct ?? null}
          iconUrl={IconGraphUp}
          iconBg="rgba(193, 72, 233, 0.1)"
        />
        <IndicatorCard
          label="Всего доход"
          value={
            summary.data
              ? formatTengeCompact(summary.data.totalIncome.valueTenge)
              : "—"
          }
          growthPct={summary.data?.totalIncome.growthPct ?? null}
          iconUrl={IconMoney}
          iconBg="rgba(52, 199, 89, 0.1)"
        />
        <IndicatorCard
          label="Всего менеджеров"
          value={summary.data?.totalManagers.value ?? "—"}
          growthPct={summary.data?.totalManagers.growthPct ?? null}
          iconUrl={IconManagers}
          iconBg="rgba(255, 189, 36, 0.1)"
        />
      </div>

      <section className="flex flex-col gap-4 rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-5">
        <h2 className="text-[16px] font-semibold text-[#0E131F]">
          График продаж
        </h2>
        {chart.isLoading && !chart.data ? (
          <div className="h-[280px] animate-pulse rounded bg-grey-lighter" />
        ) : chart.data ? (
          <SalesChart points={chart.data.points} />
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-5">
        <h2 className="text-[16px] font-semibold text-[#0E131F]">Топ продаж</h2>
        {top.isLoading && !top.data ? (
          <div className="h-[200px] animate-pulse rounded bg-grey-lighter" />
        ) : top.data ? (
          <TopProductsTable items={top.data.items} />
        ) : null}
      </section>
    </div>
  );
}
