import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
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
  // `now` ticks every 60s so the now-line and past-cell dimming track real
  // time without a manual reload. The minute granularity matches the line's
  // visible precision — finer ticks would just burn renders.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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

  // Now-line: horizontal red rule across all day columns at current time. We
  // only render it when "now" lies within the visible week and the visible
  // hour band — otherwise the line would clip outside the grid or sit on
  // a different week.
  const todayIdx = days.findIndex((d) => isSameDay(d, now));
  const nowDecimalHour = now.getHours() + now.getMinutes() / 60;
  const nowInBand =
    nowDecimalHour >= HOUR_FROM && nowDecimalHour < HOUR_TO;
  const showNowLine = todayIdx !== -1 && nowInBand;
  const nowTopPx = showNowLine
    ? (nowDecimalHour - HOUR_FROM) * PX_PER_HOUR
    : 0;

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#EAECF0] bg-white">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-[#EAECF0]">
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, now);
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
      <div className="relative grid grid-cols-[60px_repeat(7,minmax(0,1fr))]">
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
          {showNowLine && (
            <div
              style={{ top: `${nowTopPx}px` }}
              className="absolute right-2 -translate-y-1/2 rounded-full bg-purple-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
            >
              {`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`}
            </div>
          )}
        </div>

        {/* Day columns */}
        {days.map((d, dayIdx) => (
          <DayColumn
            key={d.toISOString()}
            day={d}
            slots={slotsByDay[dayIdx]}
            now={now}
            onSlotClick={onSlotClick}
            onEmptyClick={onEmptyClick}
          />
        ))}

        {/* Now-line — drawn last so it sits above the cells/pills. Spans all
            day columns; the time-labels column shows the time chip instead. */}
        {showNowLine && (
          <div
            style={{ top: `${nowTopPx}px`, left: 60 }}
            className="pointer-events-none absolute right-0 h-px bg-purple-primary"
          >
            <div className="absolute -top-[3px] -left-[3px] h-[7px] w-[7px] rounded-full bg-purple-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

type DayColumnProps = {
  day: Date;
  slots: CoachSlot[];
  now: Date;
  onSlotClick: (slot: CoachSlot) => void;
  onEmptyClick: (day: Date, hour: number) => void;
};

function DayColumn({
  day,
  slots,
  now,
  onSlotClick,
  onEmptyClick,
}: DayColumnProps) {
  // Day-end marker for "is past": a cell is past iff its end-of-block has
  // already passed in real time. Comparing the cell's end (rather than start)
  // keeps the cell active during the last minute of its hour — feels more
  // forgiving and matches the backend's `starts_in_past` rule which only
  // rejects a brand-new slot whose START is in the past.
  const dayMidnight = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
  );

  return (
    <div
      className="relative border-l border-[#EAECF0]"
      style={{ height: `${GRID_HEIGHT}px` }}
    >
      {/* Hour rows — drawn as horizontal dividers + clickable empty cells */}
      {HOURS.slice(0, -1).map((h) => {
        const cellEnd = new Date(dayMidnight);
        cellEnd.setHours(h + 1);
        const isPast = cellEnd.getTime() <= now.getTime();
        return (
          <button
            key={h}
            type="button"
            disabled={isPast}
            onClick={isPast ? undefined : () => onEmptyClick(day, h)}
            style={{
              top: `${(h - HOUR_FROM) * PX_PER_HOUR}px`,
              height: `${PX_PER_HOUR}px`,
            }}
            className={clsx(
              "absolute inset-x-0 border-t border-[#F2F4F7]",
              isPast
                ? "cursor-default bg-grey-lighter/30"
                : "cursor-pointer hover:bg-grey-lighter",
            )}
            aria-label={isPast ? undefined : `Создать слот в ${h}:00`}
          />
        );
      })}

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
        const isPast = end.getTime() <= now.getTime();
        return (
          <SlotPill
            key={slot.id}
            slot={slot}
            topPx={top}
            heightPx={height}
            isPast={isPast}
            onClick={onSlotClick}
          />
        );
      })}
    </div>
  );
}
