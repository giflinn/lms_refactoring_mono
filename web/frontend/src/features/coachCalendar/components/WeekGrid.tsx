import clsx from "clsx";
import { useMemo } from "react";
import type { CoachSlot } from "../api";
import { addDays, isSameDay, weekdayShort } from "../lib/dates";
import { SlotPill } from "./SlotPill";

const HOUR_FROM = 7; // first visible hour
const HOUR_TO = 23; // last visible hour line (slots can extend up to 23:59)
const PX_PER_HOUR = 56;
const HOURS = Array.from(
  { length: HOUR_TO - HOUR_FROM + 1 },
  (_, i) => HOUR_FROM + i,
);
const GRID_HEIGHT = (HOUR_TO - HOUR_FROM) * PX_PER_HOUR;

type Props = {
  weekStart: Date;
  slots: CoachSlot[];
  onSlotClick: (slot: CoachSlot) => void;
  onEmptyClick: (day: Date, hour: number) => void;
};

export function WeekGrid({
  weekStart,
  slots,
  onSlotClick,
  onEmptyClick,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Bucket slots by day-of-week index 0..6 so each column can render its own.
  const slotsByDay = useMemo(() => {
    const buckets: CoachSlot[][] = Array.from({ length: 7 }, () => []);
    for (const slot of slots) {
      const start = new Date(slot.startsAt);
      for (let i = 0; i < 7; i += 1) {
        if (isSameDay(start, days[i])) {
          buckets[i].push(slot);
          break;
        }
      }
    }
    return buckets;
  }, [slots, days]);

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#EAECF0] bg-white">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-[#EAECF0]">
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={clsx(
                "flex flex-col items-center gap-1 border-l border-[#EAECF0] py-2",
                isToday && "bg-purple-primary/5",
              )}
            >
              <span className="text-[11px] font-medium uppercase text-grey-medium">
                {weekdayShort(d)}
              </span>
              <span
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-semibold",
                  isToday
                    ? "bg-purple-primary text-white"
                    : "text-[#0E131F]",
                )}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))]">
        {/* Hour labels column */}
        <div
          className="relative"
          style={{ height: `${GRID_HEIGHT}px` }}
        >
          {HOURS.slice(0, -1).map((h, i) => (
            <div
              key={h}
              style={{ top: `${i * PX_PER_HOUR}px` }}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-grey-medium"
            >
              {h === HOUR_FROM ? "" : `${h}:00`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, dayIdx) => (
          <DayColumn
            key={d.toISOString()}
            day={d}
            slots={slotsByDay[dayIdx]}
            onSlotClick={onSlotClick}
            onEmptyClick={onEmptyClick}
          />
        ))}
      </div>
    </div>
  );
}

type DayColumnProps = {
  day: Date;
  slots: CoachSlot[];
  onSlotClick: (slot: CoachSlot) => void;
  onEmptyClick: (day: Date, hour: number) => void;
};

function DayColumn({ day, slots, onSlotClick, onEmptyClick }: DayColumnProps) {
  return (
    <div
      className="relative border-l border-[#EAECF0]"
      style={{ height: `${GRID_HEIGHT}px` }}
    >
      {/* Hour rows — drawn as horizontal dividers + clickable empty cells */}
      {HOURS.slice(0, -1).map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onEmptyClick(day, h)}
          style={{
            top: `${(h - HOUR_FROM) * PX_PER_HOUR}px`,
            height: `${PX_PER_HOUR}px`,
          }}
          className="absolute inset-x-0 cursor-pointer border-t border-[#F2F4F7] hover:bg-grey-lighter"
          aria-label={`Создать слот в ${h}:00`}
        />
      ))}

      {/* Slot pills layered on top */}
      {slots.map((slot) => {
        const start = new Date(slot.startsAt);
        const end = new Date(slot.endsAt);
        const startMin = start.getHours() * 60 + start.getMinutes();
        const endMin = end.getHours() * 60 + end.getMinutes();
        const fromMin = HOUR_FROM * 60;
        const toMin = HOUR_TO * 60;
        const top = (Math.max(startMin, fromMin) - fromMin) * (PX_PER_HOUR / 60);
        const height =
          (Math.min(endMin, toMin) - Math.max(startMin, fromMin)) *
          (PX_PER_HOUR / 60);
        return (
          <SlotPill
            key={slot.id}
            slot={slot}
            topPx={top}
            heightPx={height}
            onClick={onSlotClick}
          />
        );
      })}
    </div>
  );
}
