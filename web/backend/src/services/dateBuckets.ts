// Shared date / bucket helpers for the dashboard + reports aggregates.
// All boundaries are computed in UTC because that's the timezone the rest of
// the app stores timestamps in (orders.first_paid_at, users.created_at).

export type Bucket = "day" | "week" | "month";

export function startOfMonthUTC(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function startOfDayUTC(at: Date): Date {
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
}

export function addMonths(at: Date, n: number): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + n, 1));
}

export function addDays(at: Date, n: number): Date {
  const d = new Date(at);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Bucket-size heuristic: short ranges deserve daily granularity; mid ranges
// (up to a quarter) collapse to weeks; anything longer reads cleanest in
// months. Inclusive on the lower bound.
export function pickBucket(fromMs: number, toMs: number): Bucket {
  const days = Math.max(1, Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000)));
  if (days <= 31) return "day";
  if (days <= 92) return "week";
  return "month";
}

const RU_MONTH_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];
const RU_MONTH_NOM = [
  "Янв",
  "Февр",
  "Март",
  "Апр",
  "Май",
  "Июнь",
  "Июль",
  "Авг",
  "Сент",
  "Окт",
  "Нояб",
  "Дек",
];

export function formatBucketLabel(start: Date, bucket: Bucket): string {
  if (bucket === "month") return RU_MONTH_NOM[start.getUTCMonth()];
  return `${start.getUTCDate()} ${RU_MONTH_SHORT[start.getUTCMonth()]}`;
}

// Each bucket aligns to its natural start (month-1 for months, ISO Monday for
// weeks, midnight UTC for days) so labels stay stable regardless of when in
// the bucket the page is opened.
export function bucketStarts(from: Date, to: Date, bucket: Bucket): Date[] {
  const result: Date[] = [];
  if (bucket === "month") {
    let cursor = startOfMonthUTC(from);
    while (cursor.getTime() <= to.getTime()) {
      result.push(cursor);
      cursor = addMonths(cursor, 1);
    }
    return result;
  }
  if (bucket === "week") {
    const fromDay = startOfDayUTC(from);
    const dow = fromDay.getUTCDay();
    const offsetToMon = dow === 0 ? -6 : 1 - dow;
    let cursor = addDays(fromDay, offsetToMon);
    while (cursor.getTime() <= to.getTime()) {
      result.push(cursor);
      cursor = addDays(cursor, 7);
    }
    return result;
  }
  let cursor = startOfDayUTC(from);
  while (cursor.getTime() <= to.getTime()) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

export function bucketEnd(start: Date, bucket: Bucket): Date {
  if (bucket === "month") return addMonths(start, 1);
  if (bucket === "week") return addDays(start, 7);
  return addDays(start, 1);
}

// Parse YYYY-MM-DD pair from query params. Returns nulls on any malformed
// or inverted input — callers respond with 400 invalid_range.
export function parseRange(
  fromRaw: unknown,
  toRaw: unknown,
): { from: Date | null; to: Date | null } {
  if (typeof fromRaw !== "string" || typeof toRaw !== "string")
    return { from: null, to: null };
  const fromMatch = fromRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const toMatch = toRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!fromMatch || !toMatch) return { from: null, to: null };
  const from = new Date(
    Date.UTC(+fromMatch[1], +fromMatch[2] - 1, +fromMatch[3]),
  );
  const to = new Date(Date.UTC(+toMatch[1], +toMatch[2] - 1, +toMatch[3]));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
    return { from: null, to: null };
  if (from.getTime() > to.getTime()) return { from: null, to: null };
  return { from, to };
}
