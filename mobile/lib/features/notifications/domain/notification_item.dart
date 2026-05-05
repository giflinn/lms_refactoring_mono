/// One delivered notification in the client's inbox. `id` is the
/// notification_deliveries row id, not the parent notifications row — that
/// way the same recurring notification produces multiple distinct items.
class NotificationItem {
  final String id;
  final String title;
  final String body;
  final DateTime sentAt;
  final DateTime? readAt;

  const NotificationItem({
    required this.id,
    required this.title,
    required this.body,
    required this.sentAt,
    required this.readAt,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: json['id'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      sentAt: DateTime.parse(json['sentAt'] as String),
      readAt: json['readAt'] == null
          ? null
          : DateTime.parse(json['readAt'] as String),
    );
  }
}

const _ruMonthsGenitive = [
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

/// "28 марта, 2024" — Figma format.
String formatNotificationDate(DateTime d) {
  final local = d.toLocal();
  return '${local.day} ${_ruMonthsGenitive[local.month - 1]}, ${local.year}';
}

/// "09:12" — Figma format.
String formatNotificationTime(DateTime d) {
  final local = d.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '$hh:$mm';
}
