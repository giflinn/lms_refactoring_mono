// Russian date/time formatting helpers shared across the catalog feature.
// Kept here (in `domain/`) so widgets and any future controllers can pull
// the same labels without crossing presentation boundaries.

const List<String> _ruMonths = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const List<String> _ruMonthsGenitive = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const List<String> _ruWeekdaysShort = [
  'ВС',
  'ПН',
  'ВТ',
  'СР',
  'ЧТ',
  'ПТ',
  'СБ',
];

/// "Май" or "Май 2026" when [withYear] is set and the year differs from now.
/// Year suffix is suppressed for the current year to keep the month pill
/// compact — the cross-year case is rare on a single-screen picker.
String monthLabel(DateTime m, {bool withYear = false}) {
  final base = _ruMonths[m.month - 1];
  if (!withYear) return base;
  final now = DateTime.now();
  if (m.year == now.year) return base;
  return '$base ${m.year}';
}

/// "марта" — used inside "29 марта, 12:00".
String monthGenitive(int month1Based) => _ruMonthsGenitive[month1Based - 1];

/// "ВТ" / "СБ" / etc. DateTime.weekday is 1..7 Mon..Sun; we map to a Sun-first
/// list to align with the shared Russian convention used on the admin
/// calendar.
String weekdayShort(DateTime d) {
  final dow = d.weekday % 7;
  return _ruWeekdaysShort[dow];
}

/// "9:30" — single-digit hours, two-digit minutes.
String hhmm(DateTime d) {
  return '${d.hour}:${d.minute.toString().padLeft(2, '0')}';
}

/// Calendar-day equality (ignores time-of-day).
bool sameDay(DateTime a, DateTime b) {
  return a.year == b.year && a.month == b.month && a.day == b.day;
}
