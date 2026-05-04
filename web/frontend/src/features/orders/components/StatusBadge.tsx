import clsx from "clsx";
import type { FulfillmentStatus, PaymentStatus } from "../api";

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "Ожидает оплаты",
  paid: "Оплачено",
  unpaid: "Не оплачено",
  refunded: "Возврат",
};

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  pending: "border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-[#0E131F]",
  paid: "border-[#34C759] bg-[rgba(52,199,89,0.1)] text-[#34C759]",
  unpaid: "border-[#FA8905] bg-[rgba(255,149,0,0.1)] text-[#FA8905]",
  refunded: "border-[#96999D] bg-[rgba(150,153,157,0.1)] text-[#50555C]",
};

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  new: "Новый",
  active: "Активный",
  completed: "Завершен",
  cancelled: "Отменен",
};

const FULFILLMENT_STYLES: Record<FulfillmentStatus, string> = {
  new: "border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-[#0E131F]",
  active: "border-[#810CA8] bg-[rgba(129,12,168,0.08)] text-[#810CA8]",
  completed:
    "border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-[#50555C]",
  cancelled: "border-[#FF3B30] bg-[rgba(255,59,48,0.1)] text-[#FF3B30]",
};

const BADGE_BASE =
  "inline-flex h-[28px] items-center rounded-[8px] border px-2.5 text-[13px] font-medium leading-none whitespace-nowrap";

export function PaymentBadge({
  status,
  className,
}: {
  status: PaymentStatus;
  className?: string;
}) {
  return (
    <span className={clsx(BADGE_BASE, PAYMENT_STYLES[status], className)}>
      {PAYMENT_LABELS[status]}
    </span>
  );
}

export function FulfillmentBadge({
  status,
  className,
}: {
  status: FulfillmentStatus;
  className?: string;
}) {
  return (
    <span className={clsx(BADGE_BASE, FULFILLMENT_STYLES[status], className)}>
      {FULFILLMENT_LABELS[status]}
    </span>
  );
}

export function paymentLabel(status: PaymentStatus): string {
  return PAYMENT_LABELS[status];
}
export function fulfillmentLabel(status: FulfillmentStatus): string {
  return FULFILLMENT_LABELS[status];
}

export const PAYMENT_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: "pending", label: PAYMENT_LABELS.pending },
  { value: "paid", label: PAYMENT_LABELS.paid },
  { value: "unpaid", label: PAYMENT_LABELS.unpaid },
  { value: "refunded", label: PAYMENT_LABELS.refunded },
];

export const FULFILLMENT_OPTIONS: {
  value: FulfillmentStatus;
  label: string;
}[] = [
  { value: "new", label: FULFILLMENT_LABELS.new },
  { value: "active", label: FULFILLMENT_LABELS.active },
  { value: "completed", label: FULFILLMENT_LABELS.completed },
  { value: "cancelled", label: FULFILLMENT_LABELS.cancelled },
];
