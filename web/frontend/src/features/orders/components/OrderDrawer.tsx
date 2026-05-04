import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Drawer } from "../../../components/ui/Drawer";
import { Avatar } from "../../../components/Avatar";
import {
  ApiError,
  type FulfillmentStatus,
  type PaymentStatus,
} from "../api";
import { useOrder, usePatchOrder } from "../queries";
import { FulfillmentStatusMenu, PaymentStatusMenu } from "./StatusMenu";
import { BookingConflictDialog } from "./BookingConflictDialog";
import { formatBookingRange, formatOrderDate, formatTenge } from "../format";

type Props = {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
};

const PAYMENT_BADGE_STYLES: Record<PaymentStatus, string> = {
  new: "border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-[#0E131F]",
  paid: "border-[#34C759] bg-[rgba(52,199,89,0.1)] text-[#34C759]",
  unpaid: "border-[#FA8905] bg-[rgba(255,149,0,0.1)] text-[#FA8905]",
  refunded: "border-[#96999D] bg-[rgba(150,153,157,0.1)] text-[#50555C]",
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  new: "Новый",
  paid: "Оплачено",
  unpaid: "Не оплачено",
  refunded: "Возврат",
};

const FULFILLMENT_BADGE_STYLES: Record<FulfillmentStatus, string> = {
  active: "border-[#810CA8] bg-[rgba(129,12,168,0.08)] text-[#810CA8]",
  completed:
    "border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-[#50555C]",
  cancelled: "border-[#FF3B30] bg-[rgba(255,59,48,0.1)] text-[#FF3B30]",
};

const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  active: "Активный",
  completed: "Завершен",
  cancelled: "Отменен",
};

export function OrderDrawer({ orderId, open, onClose }: Props) {
  const orderQuery = useOrder(open ? orderId : null);
  const patch = usePatchOrder();

  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [fulfillmentMenuOpen, setFulfillmentMenuOpen] = useState(false);
  const paymentTriggerRef = useRef<HTMLButtonElement>(null);
  const fulfillmentTriggerRef = useRef<HTMLButtonElement>(null);

  // Booking-conflict modal state. Only fulfillment changes can hit it.
  const [conflict, setConflict] = useState<{
    target: FulfillmentStatus;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setPaymentMenuOpen(false);
      setFulfillmentMenuOpen(false);
      setConflict(null);
    }
  }, [open]);

  const order = orderQuery.data;
  const isLoading = open && orderQuery.isLoading;
  const isError = open && orderQuery.isError;

  const title = order ? `Заказ №${order.orderNumber}` : "Заказ";

  async function applyPayment(target: PaymentStatus) {
    if (!order) return;
    try {
      await patch.mutateAsync({ id: order.id, paymentStatus: target });
    } catch (err) {
      console.error("[orders] payment status change failed", err);
    }
  }

  async function applyFulfillment(target: FulfillmentStatus, force: boolean) {
    if (!order) return;
    try {
      await patch.mutateAsync({
        id: order.id,
        fulfillmentStatus: target,
        force,
      });
      setConflict(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === "booking_conflict") {
        setConflict({ target });
        return;
      }
      console.error("[orders] fulfillment status change failed", err);
    }
  }

  return (
    <>
      <Drawer
        open={open}
        title={title}
        onClose={onClose}
        footer={
          order && (
            <div className="flex items-center justify-between text-[16px] font-medium">
              <span className="text-grey-dark">Общая сумма</span>
              <span className="text-purple-primary">
                {formatTenge(order.totalTenge)}
              </span>
            </div>
          )
        }
      >
        {isLoading && (
          <div className="py-12 text-center text-[14px] text-grey-medium">
            Загрузка…
          </div>
        )}
        {isError && (
          <div className="py-12 text-center text-[14px] text-red-error">
            Не удалось загрузить заказ.
          </div>
        )}
        {order && (
          <div className="flex flex-col gap-4 pb-6">
            <Section label="Клиент">
              <PersonRow
                firstName={order.client.firstName}
                lastName={order.client.lastName}
                email={order.client.email}
                avatarUrl={order.client.avatarUrl}
              />
            </Section>

            <Section label="Менеджер">
              {order.manager ? (
                <PersonRow
                  firstName={order.manager.firstName}
                  lastName={order.manager.lastName}
                  email={order.manager.email}
                  avatarUrl={order.manager.avatarUrl}
                />
              ) : (
                <span className="text-[14px] text-grey-medium">—</span>
              )}
            </Section>

            <Section label="Оплата">
              <button
                ref={paymentTriggerRef}
                type="button"
                onClick={() => setPaymentMenuOpen((v) => !v)}
                disabled={patch.isPending}
                className={clsx(
                  "flex h-[44px] w-full cursor-pointer items-center gap-3 rounded-[8px] border px-3 text-[14px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
                  PAYMENT_BADGE_STYLES[order.paymentStatus],
                )}
              >
                <span className="flex-1 text-left">
                  {PAYMENT_LABEL[order.paymentStatus]}
                </span>
                {order.firstPaidAt && (
                  <span className="text-[13px] font-normal opacity-80">
                    {formatOrderDate(order.firstPaidAt)}
                  </span>
                )}
                <ChevronDown size={18} strokeWidth={1.5} />
              </button>
            </Section>

            <Section label="Состояние">
              <button
                ref={fulfillmentTriggerRef}
                type="button"
                onClick={() => setFulfillmentMenuOpen((v) => !v)}
                disabled={patch.isPending}
                className={clsx(
                  "flex h-[44px] w-full cursor-pointer items-center gap-3 rounded-[8px] border px-3 text-[14px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
                  FULFILLMENT_BADGE_STYLES[order.fulfillmentStatus],
                )}
              >
                <span className="flex-1 text-left">
                  {FULFILLMENT_LABEL[order.fulfillmentStatus]}
                </span>
                <ChevronDown size={18} strokeWidth={1.5} />
              </button>
            </Section>

            <Section label="Товаров">
              <div className="flex flex-col gap-2">
                {order.items.map((it) => (
                  <ItemCard
                    key={it.id}
                    chip={it.productCategoryName}
                    title={it.productTitle}
                    dateLabel={
                      it.bookedStart && it.bookedEnd
                        ? formatBookingRange(it.bookedStart, it.bookedEnd)
                        : it.expiresAt
                          ? `до ${formatOrderDate(it.expiresAt)}`
                          : (it.productSubtitle ?? "—")
                    }
                    price={formatTenge(it.unitPriceTenge)}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}
      </Drawer>

      {order && (
        <PaymentStatusMenu
          open={paymentMenuOpen}
          current={order.paymentStatus}
          triggerRef={paymentTriggerRef}
          onClose={() => setPaymentMenuOpen(false)}
          onSelect={(s) => applyPayment(s)}
        />
      )}

      {order && (
        <FulfillmentStatusMenu
          open={fulfillmentMenuOpen}
          current={order.fulfillmentStatus}
          triggerRef={fulfillmentTriggerRef}
          onClose={() => setFulfillmentMenuOpen(false)}
          onSelect={(s) => applyFulfillment(s, false)}
        />
      )}

      <BookingConflictDialog
        open={conflict !== null}
        pending={patch.isPending}
        onCancel={() => setConflict(null)}
        onForce={() => {
          if (conflict) applyFulfillment(conflict.target, true);
        }}
      />
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="py-1 text-[14px] font-medium text-grey-dark">
        {label}
      </span>
      {children}
    </div>
  );
}

function PersonRow({
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
        size={40}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
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

function ItemCard({
  chip,
  title,
  dateLabel,
  price,
}: {
  chip: string;
  title: string;
  dateLabel: string;
  price: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-[#EAECF0] bg-[#F9F9F9] p-3">
      <span className="inline-flex w-fit items-center rounded-[6px] border border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] px-2.5 py-1 text-[12px] font-medium text-grey-medium">
        {chip}
      </span>
      <p className="text-[15px] font-medium text-grey-dark">{title}</p>
      <div className="h-px w-full bg-[#EAECF0]" />
      <div className="flex items-center justify-between text-[14px] font-medium">
        <span className="text-grey-dark/60">{dateLabel}</span>
        <span className="text-purple-primary">{price}</span>
      </div>
    </div>
  );
}
