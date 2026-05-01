import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Drawer({ open, title, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-[rgba(14,7,16,0.4)]"
        onClick={onClose}
        aria-hidden
      />
      <aside className="flex h-full w-[500px] flex-col bg-white shadow-[-6px_0_27px_rgba(0,0,0,0.05)]">
        <header className="flex items-center justify-between px-6 py-4">
          <h2 className="text-[18px] font-medium text-[#0E131F]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-grey-lighter transition-colors cursor-pointer"
            aria-label="Закрыть"
          >
            <X size={24} strokeWidth={1.5} className="text-grey-dark" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 pt-6">{children}</div>
        {footer && (
          <footer className="border-t border-[#EAECF0] p-6">{footer}</footer>
        )}
      </aside>
    </div>
  );
}
