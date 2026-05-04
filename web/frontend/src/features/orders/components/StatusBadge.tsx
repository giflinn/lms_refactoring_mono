import clsx from "clsx";
import type { OrderStatus } from "../api";

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый заказ",
  paid: "Оплачено",
  unpaid: "Не оплачено",
  cancelled: "Отменен",
};

// Tailwind classes per status. Match the Figma palette using inline rgba —
// the project's tokens.json doesn't yet expose alpha-tinted variants of
// every color. Keep classnames compact so the table row stays readable.
const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "border-[rgba(102,112,133,0.3)] bg-[#FCFAFD] text-[#0E131F]",
  paid: "border-[#34C759] bg-[rgba(52,199,89,0.1)] text-[#34C759]",
  unpaid: "border-[#FA8905] bg-[rgba(255,149,0,0.1)] text-[#FA8905]",
  cancelled: "border-[#FF3B30] bg-[rgba(255,59,48,0.1)] text-[#FF3B30]",
};

type Props = {
  status: OrderStatus;
  className?: string;
};

export function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex h-[28px] items-center rounded-[8px] border px-2.5 text-[13px] font-medium leading-none whitespace-nowrap",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function statusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

export const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "new", label: STATUS_LABELS.new },
  { value: "paid", label: STATUS_LABELS.paid },
  { value: "unpaid", label: STATUS_LABELS.unpaid },
  { value: "cancelled", label: STATUS_LABELS.cancelled },
];
