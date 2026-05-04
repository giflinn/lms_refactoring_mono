import { useEffect, useRef, useState, type RefObject } from "react";
import clsx from "clsx";
import type { FulfillmentStatus, PaymentStatus } from "../api";

const PAYMENT_ITEMS: ReadonlyArray<{
  value: PaymentStatus;
  label: string;
  textCls: string;
}> = [
  { value: "new", label: "Новый", textCls: "text-[#0E131F]" },
  { value: "paid", label: "Оплачено", textCls: "text-[#34C759]" },
  { value: "unpaid", label: "Не оплачено", textCls: "text-[#FA8905]" },
  { value: "refunded", label: "Возврат", textCls: "text-[#50555C]" },
];

const FULFILLMENT_ITEMS: ReadonlyArray<{
  value: FulfillmentStatus;
  label: string;
  textCls: string;
}> = [
  { value: "active", label: "Активный", textCls: "text-[#810CA8]" },
  { value: "completed", label: "Завершен", textCls: "text-[#50555C]" },
  { value: "cancelled", label: "Отменен", textCls: "text-[#FF3B30]" },
];

type Props<S extends string> = {
  open: boolean;
  current: S;
  triggerRef: RefObject<HTMLElement | null>;
  items: ReadonlyArray<{ value: S; label: string; textCls: string }>;
  onClose: () => void;
  onSelect: (s: S) => void;
};

// Generic status-change popover. Anchored to triggerRef. Reused by both
// payment and fulfillment status rows in the drawer.
function StatusMenuBase<S extends string>({
  open,
  current,
  triggerRef,
  items,
  onClose,
  onSelect,
}: Props<S>) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const c = containerRef.current;
      const t = triggerRef.current;
      const target = e.target as Node;
      if (c && c.contains(target)) return;
      if (t && t.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, triggerRef, onClose]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 rounded-[12px] bg-white p-2 shadow-[0_4px_4.5px_rgba(0,0,0,0.1),0_16px_16px_rgba(0,0,0,0.09)]"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      {items.map((it) => {
        const isCurrent = it.value === current;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => {
              if (!isCurrent) onSelect(it.value);
              onClose();
            }}
            className={clsx(
              "flex w-full cursor-pointer items-center rounded-[6px] px-5 py-2.5 text-left text-[14px] font-medium transition-colors hover:bg-grey-lighter",
              it.textCls,
              isCurrent && "bg-[#FCFAFD]",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

type PaymentMenuProps = Omit<Props<PaymentStatus>, "items">;
export function PaymentStatusMenu(props: PaymentMenuProps) {
  return <StatusMenuBase {...props} items={PAYMENT_ITEMS} />;
}

type FulfillmentMenuProps = Omit<Props<FulfillmentStatus>, "items">;
export function FulfillmentStatusMenu(props: FulfillmentMenuProps) {
  return <StatusMenuBase {...props} items={FULFILLMENT_ITEMS} />;
}
