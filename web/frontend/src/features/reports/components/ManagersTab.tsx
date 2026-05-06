import { useMemo, useState } from "react";
import { DateRangePicker } from "../../../components/ui/DateRangePicker";
import { SearchInput } from "../../../components/ui/SearchInput";
import {
  SortableHeader,
  type SortState,
} from "../../../components/ui/SortableHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { Avatar } from "../../../components/Avatar";
import { formatTengeFull, toIsoDate } from "../../../lib/format";
import { useManagersReport } from "../queries";
import type { ManagerSortBy } from "../api";
import { DownloadButton } from "./DownloadButton";
import { ManagerDetailsDrawer } from "./ManagerDetailsDrawer";

const PAGE_SIZE = 10;

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  return { from, to };
}

export function ManagersTab() {
  const [range, setRange] = useState(defaultRange);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortState<ManagerSortBy>>({
    by: "sales",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const fromIso = useMemo(() => toIsoDate(range.from), [range.from]);
  const toIso = useMemo(() => toIsoDate(range.to), [range.to]);
  const sortStr = `${sort.by}:${sort.dir}`;

  const { data, isLoading } = useManagersReport({
    from: fromIso,
    to: toIso,
    q,
    sort: sortStr,
    page,
    pageSize: PAGE_SIZE,
  });

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const csvUrl = `/reports/managers.csv?from=${fromIso}&to=${toIso}&q=${encodeURIComponent(q.trim())}&sort=${sortStr}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Поиск по менеджеру"
          className="w-[280px]"
        />
        <DateRangePicker
          value={range}
          onChange={(r) => {
            setRange(r);
            setPage(1);
          }}
        />
        <div className="ml-auto">
          <DownloadButton
            url={csvUrl}
            filename={`managers-${fromIso}-${toIso}.csv`}
          />
        </div>
      </div>

      <div className="rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white">
        <div className="grid grid-cols-[minmax(220px,2fr)_140px_120px_140px_140px] items-center gap-2 px-4 py-3">
          <SortableHeader
            sortKey="name"
            label="Менеджер"
            state={sort}
            onSort={setSort}
          />
          <span className="text-[13px] font-medium text-grey-dark">
            Номер телефона
          </span>
          <SortableHeader
            sortKey="clients"
            label="Кол. клиентов"
            state={sort}
            onSort={setSort}
            align="center"
          />
          <SortableHeader
            sortKey="sales"
            label="Сумма покупок"
            state={sort}
            onSort={setSort}
            align="center"
          />
          <SortableHeader
            sortKey="refunds"
            label="Сумма возвратов"
            state={sort}
            onSort={setSort}
            align="center"
          />
        </div>

        {isLoading && !data ? (
          <div className="h-[400px] animate-pulse rounded-b bg-grey-lighter" />
        ) : data && data.items.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-grey-medium">
            Нет данных за выбранный период
          </div>
        ) : (
          data?.items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setDrawerId(m.id)}
              className="grid w-full cursor-pointer grid-cols-[minmax(220px,2fr)_140px_120px_140px_140px] items-center gap-2 border-t border-[#EAECF0] px-4 py-3 text-left transition-colors hover:bg-grey-lighter"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  src={m.avatarUrl}
                  firstName={m.firstName}
                  lastName={m.lastName}
                  email={m.email}
                  size={36}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-medium text-[#0E131F]">
                    {m.firstName} {m.lastName}
                  </span>
                  <span className="truncate text-[12px] text-grey-medium">
                    {m.email}
                  </span>
                </div>
              </div>
              <span className="truncate text-[13px] text-grey-dark">
                {m.phone || "—"}
              </span>
              <span className="text-center text-[13px] text-grey-dark">
                {m.clientsCount}
              </span>
              <span className="text-center text-[13px] text-grey-dark">
                {formatTengeFull(m.salesTenge)}
              </span>
              <span className="text-center text-[13px] text-grey-dark">
                {formatTengeFull(m.refundsTenge)}
              </span>
            </button>
          ))
        )}

        {data && data.total > PAGE_SIZE && (
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        )}
      </div>

      <ManagerDetailsDrawer
        managerId={drawerId}
        onClose={() => setDrawerId(null)}
      />
    </div>
  );
}
