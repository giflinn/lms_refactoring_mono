import clsx from "clsx";
import type { CoachSlot } from "../api";
import { formatTime } from "../lib/dates";

type Props = {
  slot: CoachSlot;
  topPx: number;
  heightPx: number;
  onClick: (slot: CoachSlot) => void;
};

// Renders a single slot block inside a day column. The pill background uses
// the slot type's hex color at low opacity; the left bar and the text use the
// full color so the type stays legible against varied palettes.
export function SlotPill({ slot, topPx, heightPx, onClick }: Props) {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  const color = slot.slotType.color;

  // Sub-30-min slots can't show the type label without overflow.
  const compact = heightPx < 36;

  return (
    <button
      type="button"
      onClick={() => onClick(slot)}
      style={{
        top: `${topPx}px`,
        height: `${Math.max(heightPx, 22)}px`,
        backgroundColor: `${color}1F`,
        borderLeftColor: color,
        color,
      }}
      className={clsx(
        "absolute left-1 right-1 flex flex-col items-start overflow-hidden rounded-md border-l-[3px] px-2 text-left transition hover:brightness-95",
        compact ? "justify-center" : "justify-start py-1",
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
  );
}
