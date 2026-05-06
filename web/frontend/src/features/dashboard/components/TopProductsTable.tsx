import type { TopProduct } from "../api";
import { formatTengeFull } from "../../../lib/format";

type Props = {
  items: TopProduct[];
};

export function TopProductsTable({ items }: Props) {
  return (
    <div className="flex w-full flex-col">
      <div className="grid grid-cols-[1fr_120px_160px_120px] items-center gap-2 rounded-[8px] bg-grey-lighter px-4 py-2.5 text-[13px] font-medium text-grey-dark">
        <span>Продукт</span>
        <span className="text-center">Количество</span>
        <span className="text-center">Доход</span>
        <span className="text-right">Цена</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-grey-medium">
          Нет продаж за выбранный период
        </div>
      ) : (
        items.map((it) => (
          <div
            key={it.productId}
            className="grid grid-cols-[1fr_120px_160px_120px] items-center gap-2 border-b border-[#EAECF0] px-4 py-3 text-[13px] last:border-b-0"
          >
            <span className="truncate font-medium text-[#0E131F]">
              {it.productTitle}
            </span>
            <span className="text-center text-grey-dark">{it.quantity}</span>
            <span className="text-center text-grey-dark">
              {formatTengeFull(it.incomeTenge)}
            </span>
            <span className="text-right text-grey-dark">
              {it.currentPriceTenge == null
                ? "по запросу"
                : formatTengeFull(it.currentPriceTenge)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
