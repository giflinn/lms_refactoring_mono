import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import type { OrderListItem } from "../api";
import { StatusBadge } from "./StatusBadge";
import { formatOrderDate, formatTenge } from "../format";

type Props = {
  orders: OrderListItem[];
  onOpen: (o: OrderListItem) => void;
};

export function OrdersTable({ orders, onOpen }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center bg-background text-[14px] font-medium text-grey-dark">
        <div className="w-[160px] border-r border-[#EAECF0] bg-[#F9F9F9] px-4 py-3">
          № Заказа
        </div>
        <div className="flex flex-1 items-center gap-4 px-4 py-3">
          <div className="w-[150px]">Дата</div>
          <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
            Клиент
          </div>
          <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
            Менеджер
          </div>
          <div aria-hidden className="flex-1" />
          <div className="w-[70px] text-right">Товаров</div>
          <div className="w-[110px] text-right">Сумма</div>
          {/* CTA column has no header — matches managers/clients tables. */}
          <div className="w-[140px]" aria-hidden />
        </div>
      </div>
      <div className="flex flex-col">
        {orders.length === 0 ? (
          <div className="px-6 py-12 text-center text-[14px] text-grey-medium">
            Нет заказов
          </div>
        ) : (
          orders.map((o, i) => (
            <OrderRow
              key={o.id}
              order={o}
              striped={i % 2 === 1}
              onOpen={() => onOpen(o)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PersonCell({
  firstName,
  lastName,
  email,
  avatarUrl,
}: {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        src={avatarUrl}
        firstName={firstName}
        lastName={lastName}
        email={email}
        size={36}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[14px] font-medium leading-tight text-[#0E131F]">
          {firstName} {lastName}
        </p>
        <p className="truncate text-[13px] font-medium leading-tight text-[#96999D]">
          {email}
        </p>
      </div>
    </div>
  );
}

function OrderRow({
  order,
  striped,
  onOpen,
}: {
  order: OrderListItem;
  striped: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className={clsx(
        "flex items-stretch border-b border-[#EAECF0]",
        striped && "bg-[#FBFBFB]",
      )}
    >
      <div className="flex w-[160px] flex-col items-start justify-center gap-2 border-r border-[#EAECF0] bg-white px-4 py-3">
        <span className="text-[14px] font-medium text-[#0E131F]">
          {order.orderNumber}
        </span>
        <StatusBadge status={order.status} />
      </div>
      <div className="flex flex-1 items-center gap-4 px-4 py-3 text-[13px] text-grey-dark">
        <div className="w-[150px]">{formatOrderDate(order.createdAt)}</div>
        <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
          <PersonCell
            firstName={order.client.firstName}
            lastName={order.client.lastName}
            email={order.client.email}
            avatarUrl={order.client.avatarUrl}
          />
        </div>
        <div className="min-w-0 max-w-[320px] flex-1 basis-[240px]">
          {order.manager ? (
            <PersonCell
              firstName={order.manager.firstName}
              lastName={order.manager.lastName}
              email={order.manager.email}
              avatarUrl={order.manager.avatarUrl}
            />
          ) : (
            <span className="text-grey-medium">—</span>
          )}
        </div>
        <div aria-hidden className="flex-1" />
        <div className="w-[70px] text-right">{order.itemsCount}</div>
        <div className="w-[110px] text-right font-medium text-[#0E131F]">
          {formatTenge(order.totalTenge)}
        </div>
        <div className="flex w-[140px] justify-end">
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-4 py-2 text-[14px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors"
          >
            Просмотреть
          </button>
        </div>
      </div>
    </div>
  );
}
