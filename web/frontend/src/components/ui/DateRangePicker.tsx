import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ru } from "date-fns/locale";
import { Calendar } from "lucide-react";
import clsx from "clsx";
import { formatDateRu } from "../../lib/format";
import "react-day-picker/style.css";

type Props = {
  value: { from: Date; to: Date };
  onChange: (next: { from: Date; to: Date }) => void;
};

type Preset = {
  label: string;
  build: () => { from: Date; to: Date };
};

// Common analyst windows. End-of-day is implicit — the API treats `to` as
// inclusive (it queries `< to + 1 day` server-side).
const PRESETS: Preset[] = [
  {
    label: "Последние 7 дней",
    build: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 6);
      return { from, to };
    },
  },
  {
    label: "Последние 30 дней",
    build: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      return { from, to };
    },
  },
  {
    label: "Текущий месяц",
    build: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date();
      return { from, to };
    },
  },
  {
    label: "Прошлый месяц",
    build: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from, to };
    },
  },
  {
    label: "Текущий год",
    build: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date();
      return { from, to };
    },
  },
  {
    label: "Последние 12 месяцев",
    build: () => {
      const to = new Date();
      const from = new Date();
      from.setMonth(from.getMonth() - 11);
      from.setDate(1);
      return { from, to };
    },
  },
];

// Approx. width of the dropdown (180px preset rail + ~520px for two months
// of calendar + padding). Used only to pick the open side so a few px off is
// fine — we never set this as the actual width.
const DROPDOWN_WIDTH_PX = 720;

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  // 'left' = dropdown's left edge sits on the trigger's left edge (extends
  // rightward). 'right' = right edges aligned (extends leftward). Picked
  // when opening based on viewport room, so triggers near the right edge
  // (e.g. inside a drawer) don't clip off-screen.
  const [openSide, setOpenSide] = useState<"left" | "right">("left");
  // Two-step selection: first click sets `from`, second click sets `to`.
  // Don't commit until both endpoints are picked, so consumer queries don't
  // refetch on the intermediate state.
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: value.from,
    to: value.to,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const wouldClipRight =
      rect.left + DROPDOWN_WIDTH_PX > window.innerWidth - 16;
    setOpenSide(wouldClipRight ? "right" : "left");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft({ from: value.from, to: value.to });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setDraft({ from: value.from, to: value.to });
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, value.from, value.to]);

  function commit(range: DateRange | undefined) {
    if (range?.from && range.to) {
      onChange({ from: range.from, to: range.to });
      setOpen(false);
    }
  }

  function applyPreset(p: Preset) {
    const range = p.build();
    setDraft(range);
    onChange(range);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex h-9 cursor-pointer items-center gap-2 rounded-[8px] border bg-white px-3 text-[13px] font-medium text-grey-dark transition-colors",
          open
            ? "border-purple-dark"
            : "border-[rgba(102,112,133,0.3)] hover:border-grey-medium",
        )}
      >
        <Calendar size={16} strokeWidth={1.75} className="text-grey-medium" />
        <span>
          {formatDateRu(value.from)} — {formatDateRu(value.to)}
        </span>
      </button>
      {open && (
        <div
          className={clsx(
            "absolute top-full z-30 mt-1 flex rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white shadow-[0_8px_24px_-4px_rgba(16,24,40,0.1)]",
            openSide === "left" ? "left-0" : "right-0",
          )}
        >
          <div className="flex w-[180px] flex-col gap-0.5 border-r border-[#EAECF0] py-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="cursor-pointer px-4 py-2 text-left text-[13px] text-grey-dark transition-colors hover:bg-grey-lighter"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="app-rdp p-3">
            <DayPicker
              mode="range"
              numberOfMonths={2}
              locale={ru}
              selected={draft}
              onSelect={(range) => {
                setDraft(range);
                commit(range);
              }}
              defaultMonth={value.from}
              showOutsideDays={false}
              weekStartsOn={1}
            />
          </div>
        </div>
      )}
    </div>
  );
}
