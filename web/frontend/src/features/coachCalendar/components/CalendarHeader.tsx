import clsx from "clsx";
import { ChevronLeft, ChevronRight, Plus, Settings } from "lucide-react";
import type { SlotType } from "../api";
import { formatWeekRange } from "../lib/dates";

type Props = {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  selectedSlotTypeId: string | null;
  onSelectSlotType: (id: string | null) => void;
  slotTypes: SlotType[];
  onManageTypes: () => void;
  onCreateSlot: () => void;
};

export function CalendarHeader({
  weekStart,
  onPrev,
  onNext,
  onToday,
  selectedSlotTypeId,
  onSelectSlotType,
  slotTypes,
  onManageTypes,
  onCreateSlot,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NavButton onClick={onPrev} ariaLabel="Предыдущая неделя">
            <ChevronLeft size={18} strokeWidth={2} />
          </NavButton>
          <button
            type="button"
            onClick={onToday}
            className="h-9 cursor-pointer rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[13px] font-medium text-grey-dark hover:bg-grey-lighter"
          >
            Сегодня
          </button>
          <NavButton onClick={onNext} ariaLabel="Следующая неделя">
            <ChevronRight size={18} strokeWidth={2} />
          </NavButton>
          <span className="ml-2 text-[14px] font-semibold text-[#0E131F]">
            {formatWeekRange(weekStart)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onManageTypes}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white px-3 text-[13px] font-medium text-grey-dark hover:bg-grey-lighter"
          >
            <Settings size={16} strokeWidth={1.7} />
            Типы слотов
          </button>
          <button
            type="button"
            onClick={onCreateSlot}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-[8px] bg-purple-primary pl-3 pr-4 text-[13px] font-medium text-white hover:opacity-90"
          >
            <Plus size={16} strokeWidth={2} />
            Создать слот
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={selectedSlotTypeId === null}
          onClick={() => onSelectSlotType(null)}
        >
          Все
        </FilterChip>
        {slotTypes.map((t) => (
          <FilterChip
            key={t.id}
            color={t.color}
            active={selectedSlotTypeId === t.id}
            onClick={() => onSelectSlotType(t.id)}
          >
            {t.name}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

function NavButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[8px] border border-[rgba(102,112,133,0.3)] bg-white text-grey-dark hover:bg-grey-lighter"
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active && color
          ? { backgroundColor: `${color}1F`, color, borderColor: color }
          : undefined
      }
      className={clsx(
        "flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition",
        active && !color && "border-purple-primary bg-purple-primary text-white",
        !active &&
          "border-[rgba(102,112,133,0.3)] bg-white text-grey-dark hover:bg-grey-lighter",
      )}
    >
      {color && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </button>
  );
}
