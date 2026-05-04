import clsx from "clsx";
import type { CoachBooking, CoachSlot } from "../api";
import { formatTime } from "../lib/dates";

type Props = {
  slot: CoachSlot;
  topPx: number;
  heightPx: number;
  pxPerHour: number;
  isPast: boolean;
  onClick: (slot: CoachSlot) => void;
  onBookingClick: (booking: CoachBooking) => void;
};

// Renders a single slot block inside a day column. The pill background uses
// the slot type's hex color at low opacity; the left bar and the text use the
// full color so the type stays legible against varied palettes. Past slots
// (end < now) keep the same shape but render dimmer so the eye sweeps to the
// future portion of the calendar.
//
// Bookings are drawn as solid-colored sub-strips layered over the pill at the
// position they occupy inside the slot's time range. Each booking is its own
// button so a click on it opens the related order rather than starting a
// slot edit.
export function SlotPill({
  slot,
  topPx,
  heightPx,
  pxPerHour,
  isPast,
  onClick,
  onBookingClick,
}: Props) {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  const color = slot.slotType.color;

  // Sub-30-min slots can't show the type label without overflow.
  const compact = heightPx < 36;
  const slotStartMs = start.getTime();
  const pxPerMs = pxPerHour / (60 * 60 * 1000);

  return (
    <div
      style={{
        top: `${topPx}px`,
        height: `${Math.max(heightPx, 22)}px`,
      }}
      className="absolute left-1 right-1"
    >
      <button
        type="button"
        onClick={() => onClick(slot)}
        style={{
          backgroundColor: `${color}1F`,
          borderLeftColor: color,
          color,
        }}
        className={clsx(
          "absolute inset-0 flex flex-col items-start overflow-hidden rounded-md border-l-[3px] px-2 text-left transition",
          compact ? "justify-center" : "justify-start py-1",
          isPast ? "opacity-50" : "hover:brightness-95",
        )}
      >
        <span className="text-[11px] font-medium leading-tight">
          {formatTime(start)} – {formatTime(end)}
        </span>
        {!compact && (
          <span className="truncate text-[12px] font-semibold leading-tight">
            {slot.slotType.name}
          </span>
        )}
      </button>
      {slot.bookings.map((b) => {
        const bStart = new Date(b.startsAt).getTime();
        const bEnd = new Date(b.endsAt).getTime();
        const offsetTopPx = Math.max(0, (bStart - slotStartMs) * pxPerMs);
        const heightPx = Math.max(14, (bEnd - bStart) * pxPerMs);
        const initials =
          (b.client.firstName[0] ?? "") + (b.client.lastName[0] ?? "");
        return (
          <button
            key={b.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBookingClick(b);
            }}
            title={`${b.client.firstName} ${b.client.lastName} · ${formatTime(new Date(b.startsAt))}–${formatTime(new Date(b.endsAt))}`}
            style={{
              top: `${offsetTopPx}px`,
              height: `${heightPx}px`,
              backgroundColor: color,
            }}
            className="absolute right-1 flex w-[42px] items-center justify-center overflow-hidden rounded-[4px] text-[10px] font-semibold uppercase leading-none text-white shadow-sm transition hover:brightness-110"
          >
            {initials.toUpperCase() || "?"}
          </button>
        );
      })}
    </div>
  );
}
