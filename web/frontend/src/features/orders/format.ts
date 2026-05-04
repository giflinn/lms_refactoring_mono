// Tenge with thin spaces every 3 digits + " ₸". Numeric strings from PG
// arrive as "10000.00"; we drop the .00 fraction (orders are tenge-only).
export function formatTenge(value: string | number): string {
  const n =
    typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return "—";
  const whole = Math.round(n);
  return `${whole.toLocaleString("ru-RU").replaceAll(",", " ")} ₸`;
}

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

// "28 марта, 2024, 09:12" — same shape as the Figma table cell.
export function formatOrderDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const month = RU_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${year}, ${hh}:${mm}`;
}

const RU_MONTHS_TITLE = [
  "Января",
  "Февраля",
  "Марта",
  "Апреля",
  "Мая",
  "Июня",
  "Июля",
  "Августа",
  "Сентября",
  "Октября",
  "Ноября",
  "Декабря",
];

// "19 Марта, 12:00 - 14:00" — booking-card shape inside the order drawer.
export function formatBookingRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const day = s.getDate();
  const month = RU_MONTHS_TITLE[s.getMonth()];
  const sh = String(s.getHours()).padStart(2, "0");
  const sm = String(s.getMinutes()).padStart(2, "0");
  const eh = String(e.getHours()).padStart(2, "0");
  const em = String(e.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${sh}:${sm} - ${eh}:${em}`;
}
