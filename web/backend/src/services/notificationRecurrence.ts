// Pure math for "when does this recurring notification fire next?".
// All times are UTC — the dispatcher and the admin UI treat the column
// values as absolute instants. Day-of-week / day-of-month rules anchor on
// startsAt, so editing startsAt rewinds the schedule to that anchor.

export type RecurrenceUnit = "week" | "month" | "year";

export type RecurrenceConfig = {
  startsAt: Date;
  unit: RecurrenceUnit;
  interval: number;
  byweekday: string[] | null;
  endsAt: Date | null;
};

const WEEKDAY_TO_JS_DAY: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export const VALID_WEEKDAYS = Object.keys(WEEKDAY_TO_JS_DAY);

function offsetFromMonday(jsDay: number): number {
  // JS getUTCDay: Sun=0..Sat=6. We anchor weeks on Monday.
  return jsDay === 0 ? 6 : jsDay - 1;
}

function mondayOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() - offsetFromMonday(out.getUTCDay()));
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function setHmsFrom(target: Date, source: Date): Date {
  const out = new Date(target);
  out.setUTCHours(
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  );
  return out;
}

// Yields successive fire times in chronological order, starting from
// startsAt. The caller short-circuits as soon as it sees one past `after`
// (or past endsAt). Bounded by MAX_ITER as a safety net.
const MAX_ITER = 5000;

function* iterateFireTimes(cfg: RecurrenceConfig): Generator<Date> {
  const { startsAt, unit, interval, byweekday } = cfg;
  if (interval < 1) return;

  if (unit === "week") {
    const days =
      byweekday && byweekday.length > 0
        ? byweekday
            .map((d) => WEEKDAY_TO_JS_DAY[d])
            .filter((n): n is number => n !== undefined)
            .map(offsetFromMonday)
            .sort((a, b) => a - b)
        : [offsetFromMonday(startsAt.getUTCDay())];

    if (days.length === 0) return;

    const anchor = mondayOfWeek(startsAt);
    let weekN = 0;
    for (let i = 0; i < MAX_ITER; i++) {
      for (const off of days) {
        const day = new Date(anchor);
        day.setUTCDate(day.getUTCDate() + weekN * 7 + off);
        const t = setHmsFrom(day, startsAt);
        if (t < startsAt) continue;
        yield t;
      }
      weekN += interval;
    }
    return;
  }

  if (unit === "month") {
    for (let n = 0; n < MAX_ITER; n++) {
      const t = new Date(startsAt);
      t.setUTCMonth(t.getUTCMonth() + n * interval);
      yield t;
    }
    return;
  }

  if (unit === "year") {
    for (let n = 0; n < MAX_ITER; n++) {
      const t = new Date(startsAt);
      t.setUTCFullYear(t.getUTCFullYear() + n * interval);
      yield t;
    }
    return;
  }
}

// Find the next fire instant strictly after `after` (or at `after` when
// inclusive=true — used for the very first computation when starts_at may
// itself be the next fire). Returns null if there is no future occurrence
// within endsAt or within the iteration safety bound.
export function computeNextFireAt(
  cfg: RecurrenceConfig,
  after: Date,
  inclusive: boolean = false,
): Date | null {
  for (const t of iterateFireTimes(cfg)) {
    if (cfg.endsAt && t > cfg.endsAt) return null;
    if (inclusive ? t >= after : t > after) return t;
  }
  return null;
}
