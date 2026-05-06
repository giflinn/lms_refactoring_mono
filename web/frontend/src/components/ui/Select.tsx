import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type SelectOption<V extends string> = {
  value: V;
  label: string;
  leading?: ReactNode;
};

type Props<V extends string> = {
  label?: string;
  value: V | null;
  onChange: (value: V | null) => void;
  options: SelectOption<V>[];
  placeholder?: string;
  searchable?: boolean;
  // When true, allows clearing the value back to null. Used for filters
  // (where empty = "all"); single-value drawer fields keep it false.
  clearable?: boolean;
  disabled?: boolean;
  // Pill-style trigger for the page header filter row.
  variant?: "field" | "pill";
  className?: string;
};

export function Select<V extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = "Выбрать",
  searchable = false,
  clearable = false,
  disabled = false,
  variant = "field",
  className,
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Flip the popover above the trigger when the viewport doesn't have enough
  // room beneath. Recomputed each open so scroll position is current.
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const POPOVER_MAX = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < POPOVER_MAX && rect.top > spaceBelow);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const needle = search.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, search, searchable]);

  const isPill = variant === "pill";

  return (
    <div
      ref={containerRef}
      className={clsx("relative flex flex-col gap-1", className)}
    >
      {label && (
        <span className="py-1 text-[14px] font-medium text-grey-dark">
          {label}
        </span>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={clsx(
            "flex h-9 w-full cursor-pointer items-center gap-2 rounded-[8px] border bg-white pl-3 pr-9 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            open
              ? "border-purple-dark"
              : "border-[rgba(102,112,133,0.3)] hover:border-grey-medium",
          )}
        >
          {selected?.leading}
          <span
            className={clsx(
              "flex-1 min-w-0 truncate text-[14px]",
              selected ? "text-grey-dark" : "text-grey-medium/70",
              isPill && !selected && "text-grey-medium",
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
        </button>
        {clearable && selected && !disabled ? (
          <button
            type="button"
            aria-label="Сбросить"
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-grey-medium/70 hover:text-grey-medium"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        ) : (
          <ChevronDown
            size={18}
            strokeWidth={1.5}
            className={clsx(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-grey-medium transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </div>

      {open && (
        <div
          className={clsx(
            "absolute left-0 right-0 z-30 max-h-[280px] overflow-hidden rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_4px_8px_-2px_rgba(16,24,40,0.05),0_2px_4px_-2px_rgba(16,24,40,0.05)]",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-[#EAECF0] px-3 py-2">
              <Search size={18} strokeWidth={1.5} className="text-grey-medium" />
              <input
                type="text"
                placeholder="Поиск"
                value={search}
                autoFocus
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-grey-medium/60"
              />
            </div>
          )}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[14px] text-grey-medium">
                Ничего не найдено
              </div>
            ) : (
              filtered.map((o) => {
                const isSelected = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={clsx(
                      "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[14px] transition-colors hover:bg-grey-lighter",
                      isSelected && "bg-grey-lighter",
                    )}
                  >
                    {o.leading}
                    <span className="flex-1 truncate text-grey-dark">
                      {o.label}
                    </span>
                    {isSelected && (
                      <Check
                        size={16}
                        strokeWidth={2}
                        className="shrink-0 text-purple-primary"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
