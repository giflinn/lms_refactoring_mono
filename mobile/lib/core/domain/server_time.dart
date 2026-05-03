/// Single point of conversion for server-issued timestamps. The backend stores
/// in UTC and serializes ISO-8601 with offset (`...Z` / `...+00:00`). Inside
/// the app we want every `DateTime` to be in the device's local timezone, so
/// `_sameDate(dt, DateTime.now())` style comparisons stay correct.
///
/// All `*_models.dart` parsing JSON from the API should use these helpers
/// instead of calling `DateTime.parse` directly — that's the contract that
/// keeps "Сегодня / Вчера / 12 марта" labels honest in non-UTC regions
/// (KZ is UTC+5).
library;

DateTime parseServerTime(String iso) => DateTime.parse(iso).toLocal();

DateTime? parseServerTimeOpt(String? iso) =>
    iso == null ? null : DateTime.parse(iso).toLocal();
