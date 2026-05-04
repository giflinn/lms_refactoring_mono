import { ChevronRight } from "lucide-react";
import type { OrderListItem } from "../../orders/api";
import {
  FulfillmentBadge,
  PaymentBadge,
} from "../../orders/components/StatusBadge";
import { formatOrderDate, formatTenge } from "../../orders/format";

type Props = {
  order: OrderListItem;
  onClick: () => void;
};

export function OrderHistoryCard({ order, onClick }: Props) {
  const managerName = order.manager
    ? `${order.manager.firstName} ${order.manager.lastName}`.trim() ||
      order.manager.email
    : "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer flex-col rounded-[12px] bg-[#F9F9F9] p-3 text-left transition-colors hover:bg-[#F2F2F2]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <PaymentBadge status={order.paymentStatus} />
          <FulfillmentBadge status={order.fulfillmentStatus} />
        </div>
        <ChevronRight
          size={20}
          strokeWidth={1.5}
          className="mt-1 shrink-0 text-grey-medium transition-colors group-hover:text-grey-dark"
        />
      </div>

      <div className="my-3 h-px w-full border-t border-dashed border-[rgba(102,112,133,0.3)]" />

      <Row label="№ заказа" value={String(order.orderNumber)} />
      <Row label="Дата" value={formatOrderDate(order.createdAt)} />
      <Row label="Менеджер" value={managerName} />

      <div className="my-3 h-px w-full border-t border-dashed border-[rgba(102,112,133,0.3)]" />

      <Row label="Товаров" value={String(order.itemsCount)} />
      <Row
        label="Сумма"
        value={formatTenge(order.totalTenge)}
        valueClassName="text-purple-primary"
      />
    </button>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1 text-[14px] font-medium leading-[1.4]">
      <span className="text-[#96999D]">{label}</span>
      <span className={valueClassName ?? "text-[#0E131F]"}>{value}</span>
    </div>
  );
}
