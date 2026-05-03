// Date and presence formatting helpers for the chat UI. Keep them in one
// place so the list, header, and message bubbles use a consistent style.

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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// HH:MM, used inside message bubbles and as the trailing column in chat list
// rows (when the row is from today; otherwise we show the date label).
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Smart label for chat-list rows: today → HH:MM, yesterday → "Вчера", same
// year → "12 марта", older → "12 марта 2024".
export function formatListStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return formatTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Вчера";
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
  }
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Day separator inside the conversation: "Сегодня", "Вчера", "12 марта 2024".
export function formatDaySeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Сегодня";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Вчера";
  }
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Returns yyyy-mm-dd for grouping consecutive messages by day in the conv view.
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatPresence(
  online: boolean | undefined,
  lastSeenAt: string | null | undefined,
): string {
  if (online) return "В сети";
  if (!lastSeenAt) return "Не в сети";
  const seen = new Date(lastSeenAt);
  const now = new Date();
  const diffSec = Math.max(0, (now.getTime() - seen.getTime()) / 1000);
  if (diffSec < 60) return "был(а) в сети только что";
  if (diffSec < 60 * 60) {
    const m = Math.floor(diffSec / 60);
    return `был(а) в сети ${m} мин назад`;
  }
  if (diffSec < 60 * 60 * 24) {
    const h = Math.floor(diffSec / 3600);
    return `был(а) в сети ${h} ч назад`;
  }
  return `был(а) в сети ${formatDaySeparator(lastSeenAt).toLowerCase()}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
