import { useState } from "react";
import clsx from "clsx";
import { ShoppingBag } from "lucide-react";
import type { FulfillmentStatus } from "../../orders/api";
import { useOrders } from "../../orders/queries";
import { OrderHistoryCard } from "./OrderHistoryCard";

type Props = {
  clientId: string;
  onOpenOrder: (orderId: string) => void;
};

const TABS: { value: FulfillmentStatus; label: string }[] = [
  { value: "new", label: "Новые" },
  { value: "active", label: "Активные" },
  { value: "completed", label: "Завершенные" },
  { value: "cancelled", label: "Отмененные" },
];

export function PurchaseHistoryTab({ clientId, onOpenOrder }: Props) {
  const [tab, setTab] = useState<FulfillmentStatus>("new");

  const list = useOrders({
    clientId,
    fulfillmentStatus: tab,
    page: 1,
    pageSize: 50,
  });

  const orders = list.data?.orders ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex w-full overflow-hidden rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white p-0.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={clsx(
              "flex-1 cursor-pointer rounded-[6px] px-2 py-2 text-[13px] font-medium leading-tight transition-colors",
              tab === t.value
                ? "border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-purple-primary"
                : "border border-transparent text-[#0E131F] hover:text-purple-primary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isError && (
        <div className="rounded-[8px] border border-red-error/40 bg-red-error/5 p-3 text-[13px] text-red-error">
          Не удалось загрузить заказы.
        </div>
      )}

      {list.isLoading && (
        <div className="py-12 text-center text-[14px] text-grey-medium">
          Загрузка…
        </div>
      )}

      {!list.isLoading && !list.isError && orders.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-grey-lighter">
            <ShoppingBag
              size={28}
              strokeWidth={1.5}
              className="text-grey-medium"
            />
          </div>
          <p className="text-[14px] text-grey-medium">
            Пока нет заказов в этом статусе.
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <OrderHistoryCard
              key={o.id}
              order={o}
              onClick={() => onOpenOrder(o.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
