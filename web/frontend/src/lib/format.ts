// 512000 → "₸512K", 1230000 → "₸1.2M". Compact display for KPI cards
// where horizontal space is tight; tables use formatTengeFull.
export function formatTengeCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const rounded = m >= 10 ? Math.round(m) : Math.round(m * 10) / 10;
    return `${sign}₸${rounded}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10;
    return `${sign}₸${rounded}K`;
  }
  return `${sign}₸${Math.round(abs)}`;
}

// "30,000₸" — comma separators after the existing orders/products tables.
export function formatTengeFull(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}₸`;
}

const RU_MONTH_GENITIVE = [
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

export function formatDateRu(d: Date): string {
  return `${d.getDate()} ${RU_MONTH_GENITIVE[d.getMonth()]}, ${d.getFullYear()}`;
}

// API expects YYYY-MM-DD of the calendar date the user picked. Build it from
// local components — toISOString() would shift to UTC and break boundaries
// for users east of UTC after midnight local.
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatGrowthPct(pct: number | null): string {
  if (pct == null) return "—";
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}
