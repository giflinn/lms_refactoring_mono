// Date helpers tuned for the coach calendar week view. Weeks start on Monday
// per project convention. Times are rendered in the user's local zone — the
// server stores `timestamptz` so any DST/zone math happens in the browser.

const RU_WEEKDAYS_SHORT = [
  "ВС",
  "ПН",
  "ВТ",
  "СР",
  "ЧТ",
  "ПТ",
  "СБ",
];
const RU_WEEKDAYS_LONG = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];
const RU_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// Returns midnight Monday of the week containing `d`. Sunday is the LAST day
// of the week, not the first — JS getDay() returns 0 for Sunday so we map it
// to 7 then subtract.
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = out.getDay();
  const fromMon = dow === 0 ? 6 : dow - 1;
  out.setDate(out.getDate() - fromMon);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function endOfWeek(d: Date): Date {
  // Exclusive end — midnight Monday of the next week.
  return addDays(startOfWeek(d), 7);
}

// "29 апреля – 5 мая 2026" with a smart year suffix when the week spans years.
export function formatWeekRange(weekStart: Date): string {
  const last = addDays(weekStart, 6);
  const sameYear = weekStart.getFullYear() === last.getFullYear();
  if (!sameYear) {
    return `${weekStart.getDate()} ${RU_MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()} – ${last.getDate()} ${RU_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }
  const sameMonth = weekStart.getMonth() === last.getMonth();
  if (sameMonth) {
    return `${weekStart.getDate()} – ${last.getDate()} ${RU_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }
  return `${weekStart.getDate()} ${RU_MONTHS[weekStart.getMonth()]} – ${last.getDate()} ${RU_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
}

export function weekdayShort(d: Date): string {
  return RU_WEEKDAYS_SHORT[d.getDay()];
}

export function weekdayLong(d: Date): string {
  return RU_WEEKDAYS_LONG[d.getDay()];
}

// Returns "9:30" with no leading zero on hours, leading zero on minutes.
export function formatTime(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// "29 апреля 2026, понедельник" — used in the slot edit modal subtitle.
export function formatLongDate(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${weekdayLong(d).toLowerCase()}`;
}

// "2026-05-02" — used as a value for <input type="date"> (always local zone).
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "09:30" — used as a value for <input type="time">.
export function toTimeInputValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Combines local date string ("2026-05-02") + local time string ("09:30") into
// a Date in the user's local zone. Returns null on invalid input.
export function combineLocalDateTime(
  dateStr: string,
  timeStr: string,
): Date | null {
  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const d = new Date(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    0,
    0,
  );
  return isNaN(d.getTime()) ? null : d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
