import { useEffect, useRef, useState, type RefObject } from "react";
import clsx from "clsx";
import type { CancellationDecision } from "../api";

const ITEMS: ReadonlyArray<{
  value: CancellationDecision;
  label: string;
  textCls: string;
}> = [
  { value: "approved", label: "Одобрить", textCls: "text-[#34C759]" },
  { value: "rejected", label: "Отказать", textCls: "text-[#FF3B30]" },
];

type Props = {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSelect: (decision: CancellationDecision) => void;
};

// Decision picker for the cancellation drawer. Same pattern as the order
// drawer's StatusMenu: anchored to a trigger, dismissed on outside click /
// escape.
export function CancellationStatusMenu({
  open,
  triggerRef,
  onClose,
  onSelect,
}: Props) {
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
      {ITEMS.map((it) => (
        <button
          key={it.value}
          type="button"
          onClick={() => {
            onSelect(it.value);
            onClose();
          }}
          className={clsx(
            "flex w-full cursor-pointer items-center rounded-[6px] px-5 py-2.5 text-left text-[14px] font-medium transition-colors hover:bg-grey-lighter",
            it.textCls,
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
