import clsx from "clsx";
import { Avatar } from "../../../components/Avatar";
import type { OrderListItem } from "../api";
import { FulfillmentBadge, PaymentBadge } from "./StatusBadge";
import { formatOrderDate, formatTenge } from "../format";
import kaspiIcon from "../../../assets/icons/payment/kaspi.png";
import { CreditCard } from "lucide-react";

type Props = {
  orders: OrderListItem[];
  onOpen: (o: OrderListItem) => void;
};

export function OrdersTable({ orders, onOpen }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]">
      <div className="flex items-center bg-background text-[14px] font-medium text-grey-dark">
        <div className="w-[110px] shrink-0 border-r border-[#EAECF0] bg-[#F9F9F9] px-4 py-3">
          № Заказа
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
          <div className="w-[135px] shrink-0">Дата</div>
          <div className="min-w-0 max-w-[260px] flex-1 basis-[180px]">
            Клиент
          </div>
          <div className="min-w-0 max-w-[260px] flex-1 basis-[180px]">
            Менеджер
          </div>
          <div className="w-[95px] shrink-0">Сумма</div>
          <div className="w-[90px] shrink-0">Оплата</div>
          <div className="w-[130px] shrink-0">Статус</div>
          {/* CTA column has no header — matches managers/clients tables.
              ml-auto pins it to the right edge once the flex-1 cells
              (Клиент / Менеджер) hit their max-w; on narrow screens those
              cells consume the slack and ml-auto becomes a no-op. */}
          <div className="ml-auto w-[112px] shrink-0" aria-hidden />
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
        "flex min-h-[72px] items-stretch border-b border-[#EAECF0]",
        striped && "bg-[#FBFBFB]",
      )}
    >
      <div className="flex w-[110px] shrink-0 items-center border-r border-[#EAECF0] bg-white px-4 text-[14px] font-medium text-[#0E131F]">
        {order.orderNumber}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-[13px] text-grey-dark">
        <div className="w-[135px] shrink-0">{formatOrderDate(order.createdAt)}</div>
        <div className="min-w-0 max-w-[260px] flex-1 basis-[180px]">
          <PersonCell
            firstName={order.client.firstName}
            lastName={order.client.lastName}
            email={order.client.email}
            avatarUrl={order.client.avatarUrl}
          />
        </div>
        <div className="min-w-0 max-w-[260px] flex-1 basis-[180px]">
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
        <div className="w-[95px] shrink-0 font-medium text-[#0E131F]">
          {formatTenge(order.totalTenge)}
        </div>
        <div className="flex w-[90px] shrink-0 items-center gap-2">
          {order.paymentMethod === "card" ? (
            <>
              <CreditCard
                className="h-6 w-6 shrink-0 text-purple-primary"
                strokeWidth={1.5}
              />
              <span className="text-[13px] font-medium text-[#0E131F]">
                Карта
              </span>
            </>
          ) : (
            <>
              <img
                src={kaspiIcon}
                alt="Kaspi"
                className="h-6 w-6 shrink-0 rounded-full"
              />
              <span className="text-[13px] font-medium text-[#0E131F]">
                Kaspi
              </span>
            </>
          )}
        </div>
        <div className="flex w-[130px] shrink-0 flex-col gap-1.5">
          <PaymentBadge status={order.paymentStatus} />
          <FulfillmentBadge status={order.fulfillmentStatus} />
        </div>
        <div className="ml-auto flex w-[112px] shrink-0 justify-end">
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-3 py-2 text-[14px] font-medium text-[#0E131F] hover:bg-grey-lighter transition-colors"
          >
            Просмотреть
          </button>
        </div>
      </div>
    </div>
  );
}
