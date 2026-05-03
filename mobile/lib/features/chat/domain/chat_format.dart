// Formatting helpers shared between the client/staff chat screens.

const _months = [
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

String _pad2(int n) => n < 10 ? '0$n' : '$n';

String formatTime(DateTime dt) =>
    '${_pad2(dt.hour)}:${_pad2(dt.minute)}';

bool _sameDate(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String formatListStamp(DateTime? dt) {
  if (dt == null) return '';
  final now = DateTime.now();
  if (_sameDate(dt, now)) return formatTime(dt);
  final yesterday = now.subtract(const Duration(days: 1));
  if (_sameDate(dt, yesterday)) return 'Вчера';
  if (dt.year == now.year) return '${dt.day} ${_months[dt.month - 1]}';
  return '${dt.day} ${_months[dt.month - 1]} ${dt.year}';
}

String formatDaySeparator(DateTime dt) {
  final now = DateTime.now();
  if (_sameDate(dt, now)) return 'Сегодня';
  final yesterday = now.subtract(const Duration(days: 1));
  if (_sameDate(dt, yesterday)) return 'Вчера';
  return '${dt.day} ${_months[dt.month - 1]} ${dt.year}';
}

String dayKey(DateTime dt) =>
    '${dt.year}-${_pad2(dt.month)}-${_pad2(dt.day)}';

String formatPresence(bool online, DateTime? lastSeen) {
  if (online) return 'В сети';
  if (lastSeen == null) return 'Не в сети';
  final diff = DateTime.now().difference(lastSeen);
  if (diff.inSeconds < 60) return 'был(а) в сети только что';
  if (diff.inMinutes < 60) return 'был(а) в сети ${diff.inMinutes} мин назад';
  if (diff.inHours < 24) return 'был(а) в сети ${diff.inHours} ч назад';
  return 'был(а) в сети ${formatDaySeparator(lastSeen).toLowerCase()}';
}

String formatFileSize(int bytes) {
  if (bytes < 1024) return '$bytes Б';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).round()} КБ';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} МБ';
}
