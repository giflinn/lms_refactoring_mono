import { useMemo, useState } from "react";
import { IndicatorCard } from "../../../components/ui/IndicatorCard";
import { LineChart } from "../../../components/charts/LineChart";
import { DateRangePicker } from "../../../components/ui/DateRangePicker";
import { toIsoDate } from "../../../lib/format";
import IconClients from "../../../assets/icons/dashboard/clients.svg";
import { useNewClientsChart, useNewClientsSummary } from "../queries";

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  return { from, to };
}

export function NewClientsTab() {
  const [range, setRange] = useState(defaultRange);
  const fromIso = useMemo(() => toIsoDate(range.from), [range.from]);
  const toIso = useMemo(() => toIsoDate(range.to), [range.to]);

  const summary = useNewClientsSummary();
  const chart = useNewClientsChart(fromIso, toIso);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <IndicatorCard
          label="Текущий месяц"
          value={summary.data?.thisMonth.value ?? "—"}
          growthPct={summary.data?.thisMonth.growthPct ?? null}
          growthTrailing="тенденция"
          iconUrl={CalendarOrange}
          iconBg="rgba(250, 137, 5, 0.1)"
        />
        <IndicatorCard
          label="Прошлый месяц"
          value={summary.data?.prevMonth.value ?? "—"}
          growthPct={summary.data?.prevMonth.growthPct ?? null}
          growthTrailing="тенденция"
          iconUrl={CalendarGrey}
          iconBg="rgba(102, 112, 133, 0.1)"
        />
        <IndicatorCard
          label="Всего клиентов"
          value={summary.data?.total ?? "—"}
          iconUrl={IconClients}
          iconBg="rgba(52, 199, 89, 0.1)"
        />
      </div>

      <section className="flex flex-col gap-4 rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold text-[#0E131F]">
            Статистика новых клиентов
          </h2>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        {chart.isLoading && !chart.data ? (
          <div className="h-[280px] animate-pulse rounded bg-grey-lighter" />
        ) : chart.data ? (
          <LineChart
            points={chart.data.points.map((p) => ({
              label: p.label,
              value: p.count,
            }))}
            lineColor="#34C759"
            tooltipPrefix="Клиентов"
            formatValue={(v) => String(v)}
            emptyMessage="Нет новых клиентов за выбранный период"
          />
        ) : null}
      </section>
    </div>
  );
}

// Inline data-URI calendar icons to avoid spawning two more files for what
// are simple Lucide outlines tinted to match the IndicatorCard plate.
const CalendarOrange = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FA8905" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
)}`;
const CalendarGrey = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#667085" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
)}`;

