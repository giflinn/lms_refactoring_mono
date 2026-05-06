import { useMemo, useState } from "react";
import { DateRangePicker } from "../../../components/ui/DateRangePicker";
import {
  SortableHeader,
  type SortState,
} from "../../../components/ui/SortableHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { formatTengeFull, toIsoDate } from "../../../lib/format";
import { useSalesReport } from "../queries";
import type { SalesSortBy } from "../api";
import { DownloadButton } from "./DownloadButton";

const PAGE_SIZE = 15;

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  return { from, to };
}

export function SalesTab() {
  const [range, setRange] = useState(defaultRange);
  const [sort, setSort] = useState<SortState<SalesSortBy>>({
    by: "salesTenge",
    dir: "desc",
  });
  const [page, setPage] = useState(1);

  const fromIso = useMemo(() => toIsoDate(range.from), [range.from]);
  const toIso = useMemo(() => toIsoDate(range.to), [range.to]);
  const sortStr = `${sort.by}:${sort.dir}`;

  const { data, isLoading } = useSalesReport({
    from: fromIso,
    to: toIso,
    sort: sortStr,
    page,
    pageSize: PAGE_SIZE,
  });

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const csvUrl = `/reports/sales.csv?from=${fromIso}&to=${toIso}&sort=${sortStr}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
            filename={`sales-${fromIso}-${toIso}.csv`}
          />
        </div>
      </div>

      <div className="rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white">
        <div className="grid grid-cols-[minmax(240px,2fr)_140px_120px_140px_120px_140px] items-center gap-2 px-4 py-3">
          <SortableHeader
            sortKey="title"
            label="Товар"
            state={sort}
            onSort={setSort}
          />
          <SortableHeader
            sortKey="category"
            label="Категория"
            state={sort}
            onSort={setSort}
          />
          <SortableHeader
            sortKey="salesCount"
            label="Кол. продаж"
            state={sort}
            onSort={setSort}
            align="center"
          />
          <SortableHeader
            sortKey="salesTenge"
            label="Сумма продаж"
            state={sort}
            onSort={setSort}
            align="center"
          />
          <SortableHeader
            sortKey="refundsCount"
            label="Кол. возвратов"
            state={sort}
            onSort={setSort}
            align="center"
          />
          <SortableHeader
            sortKey="refundsTenge"
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
          data?.items.map((p) => (
            <div
              key={p.productId}
              className="grid grid-cols-[minmax(240px,2fr)_140px_120px_140px_120px_140px] items-center gap-2 border-t border-[#EAECF0] px-4 py-3"
            >
              <span className="truncate text-[14px] font-medium text-[#0E131F]">
                {p.productTitle}
              </span>
              <span className="truncate text-[13px] text-grey-dark">
                {p.categoryName}
              </span>
              <span className="text-center text-[13px] text-grey-dark">
                {p.salesCount}
              </span>
              <span className="text-center text-[13px] text-grey-dark">
                {formatTengeFull(p.salesTenge)}
              </span>
              <span className="text-center text-[13px] text-grey-dark">
                {p.refundsCount}
              </span>
              <span className="text-center text-[13px] text-grey-dark">
                {formatTengeFull(p.refundsTenge)}
              </span>
            </div>
          ))
        )}

        {data && data.total > PAGE_SIZE && (
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        )}
      </div>
    </div>
  );
}
