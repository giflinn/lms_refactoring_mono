import type {
  ClientCategory,
  Notification,
  RecurrenceUnit,
  Weekday,
} from "./api";

const RU_MONTHS_GEN = [
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateTime(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatShortDate(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

export const CATEGORY_LABEL: Record<ClientCategory, string> = {
  vip: "VIP",
  new: "Новые",
  regular: "Постоянные",
};

const UNIT_NOMINATIVE: Record<RecurrenceUnit, string> = {
  week: "Неделю",
  month: "Месяц",
  year: "Год",
};

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: "ПН",
  tue: "ВТ",
  wed: "СР",
  thu: "ЧТ",
  fri: "ПТ",
  sat: "СБ",
  sun: "ВС",
};

export const WEEKDAY_ORDER: Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export function weekdayShort(w: Weekday): string {
  return WEEKDAY_SHORT[w];
}

// Returns the chip strings shown on the card. Order matches Figma:
//   one-shot:  ["22 апреля, 9:00"]
//   recurring: ["18 апреля 2024 - 30 июня 2024", "Регулярно"]
// Category, when narrowed, gets its own chip.
export function notificationChips(n: Notification): string[] {
  const chips: string[] = [];
  if (n.isRecurring) {
    if (n.startsAt) {
      const start = formatShortDate(new Date(n.startsAt));
      const end = n.endsAt
        ? ` - ${formatShortDate(new Date(n.endsAt))}`
        : "";
      chips.push(start + end);
    }
    chips.push("Регулярно");
    if (n.recurrenceUnit && n.recurrenceInterval) {
      chips.push(
        `Каждые ${n.recurrenceInterval} ${UNIT_NOMINATIVE[n.recurrenceUnit].toLowerCase()}`,
      );
    }
  } else if (n.scheduledAt) {
    chips.push(formatDateTime(new Date(n.scheduledAt)));
  }
  if (n.status === "completed") {
    chips.push("Завершен");
  }
  if (n.category) {
    chips.push(CATEGORY_LABEL[n.category]);
  }
  return chips;
}
