import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "../../../components/Avatar";
import { LineChart } from "../../../components/charts/LineChart";
import { DateRangePicker } from "../../../components/ui/DateRangePicker";
import { Pagination } from "../../../components/ui/Pagination";
import { formatTengeFull, toIsoDate } from "../../../lib/format";
import { useManagerClients, useManagerDetail } from "../queries";
import { DownloadButton } from "./DownloadButton";

type Props = {
  managerId: string | null;
  onClose: () => void;
};

const PAGE_SIZE = 8;

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  return { from, to };
}

// Wider drawer than the standard ui/Drawer because the body packs three KPIs,
// a chart, and a paginated client table. Reusing ui/Drawer at 500px would
// crush the tabular content.
export function ManagerDetailsDrawer({ managerId, onClose }: Props) {
  const [range, setRange] = useState(defaultRange);
  const [page, setPage] = useState(1);

  const fromIso = useMemo(() => toIsoDate(range.from), [range.from]);
  const toIso = useMemo(() => toIsoDate(range.to), [range.to]);

  const detail = useManagerDetail(managerId, fromIso, toIso);
  const clients = useManagerClients(managerId, {
    from: fromIso,
    to: toIso,
    page,
    pageSize: PAGE_SIZE,
  });

  if (!managerId) return null;

  const csvUrl = `/reports/managers/${managerId}.csv?from=${fromIso}&to=${toIso}`;
  const pageCount = clients.data
    ? Math.max(1, Math.ceil(clients.data.total / PAGE_SIZE))
    : 1;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-[rgba(14,7,16,0.4)]"
        onClick={onClose}
        aria-hidden
      />
      <aside className="flex h-full w-[860px] flex-col bg-white shadow-[-6px_0_27px_rgba(0,0,0,0.05)]">
        <header className="flex items-center justify-between px-6 py-4">
          <h2 className="text-[16px] font-semibold text-[#0E131F]">Детали</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-grey-lighter"
          >
            <X size={22} strokeWidth={1.5} className="text-grey-dark" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {detail.isLoading || !detail.data ? (
            <div className="h-[600px] animate-pulse rounded bg-grey-lighter" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={detail.data.manager.avatarUrl}
                    firstName={detail.data.manager.firstName}
                    lastName={detail.data.manager.lastName}
                    email={detail.data.manager.email}
                    size={48}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[16px] font-semibold text-[#0E131F]">
                      {detail.data.manager.firstName}{" "}
                      {detail.data.manager.lastName}
                    </span>
                    <span className="truncate text-[12px] text-grey-medium">
                      {detail.data.manager.email}
                      {detail.data.manager.phone
                        ? ` · ${detail.data.manager.phone}`
                        : ""}
                    </span>
                  </div>
                </div>
                <DownloadButton
                  url={csvUrl}
                  filename={`manager-${detail.data.manager.lastName || detail.data.manager.email}-${fromIso}-${toIso}.csv`}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <SmallStat
                  label="Всего клиентов"
                  value={detail.data.summary.totalClients}
                />
                <SmallStat
                  label="Всего продаж"
                  value={detail.data.summary.totalSales.count}
                  hint={formatTengeFull(
                    detail.data.summary.totalSales.totalTenge,
                  )}
                />
                <SmallStat
                  label="Всего возвратов"
                  value={detail.data.summary.totalRefunds.count}
                  hint={formatTengeFull(
                    detail.data.summary.totalRefunds.totalTenge,
                  )}
                />
              </div>

              <section className="flex flex-col gap-3 rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-[#0E131F]">
                    График продаж менеджера
                  </h3>
                  <DateRangePicker value={range} onChange={setRange} />
                </div>
                <LineChart
                  points={detail.data.chart.points.map((p) => ({
                    label: p.label,
                    value: p.incomeTenge,
                  }))}
                  lineColor="#810CA8"
                  tooltipPrefix="Доход"
                  formatValue={formatTengeFull}
                  emptyMessage="Нет продаж за выбранный период"
                />
              </section>

              <section className="flex flex-col rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white">
                <div className="grid grid-cols-[minmax(200px,2fr)_120px_140px_120px_140px] items-center gap-2 px-4 py-3 text-[13px] font-medium text-grey-dark">
                  <span>Клиент</span>
                  <span className="text-center">Кол. продуктов</span>
                  <span className="text-center">Сумма покупок</span>
                  <span className="text-center">Кол. возвратов</span>
                  <span className="text-center">Сумма возвратов</span>
                </div>
                {clients.data?.items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[13px] text-grey-medium">
                    Нет клиентов
                  </div>
                ) : (
                  clients.data?.items.map((c) => (
                    <div
                      key={c.id}
                      className="grid grid-cols-[minmax(200px,2fr)_120px_140px_120px_140px] items-center gap-2 border-t border-[#EAECF0] px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar
                          src={c.avatarUrl}
                          firstName={c.firstName}
                          lastName={c.lastName}
                          email={c.email}
                          size={32}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] font-medium text-[#0E131F]">
                            {c.firstName} {c.lastName}
                          </span>
                          <span className="truncate text-[12px] text-grey-medium">
                            {c.email}
                          </span>
                        </div>
                      </div>
                      <span className="text-center text-[13px] text-grey-dark">
                        {c.productsCount}
                      </span>
                      <span className="text-center text-[13px] text-grey-dark">
                        {formatTengeFull(c.purchasesTenge)}
                      </span>
                      <span className="text-center text-[13px] text-grey-dark">
                        {c.refundsCount}
                      </span>
                      <span className="text-center text-[13px] text-grey-dark">
                        {formatTengeFull(c.refundsTenge)}
                      </span>
                    </div>
                  ))
                )}
                {clients.data && clients.data.total > PAGE_SIZE && (
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onChange={setPage}
                  />
                )}
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function SmallStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
      <p className="text-[12px] font-medium text-grey-dark/70">{label}</p>
      <p className="text-[22px] font-semibold leading-tight text-[#0E131F]">
        {value}
      </p>
      {hint && (
        <p className="text-[12px] font-medium text-grey-medium">{hint}</p>
      )}
    </div>
  );
}
