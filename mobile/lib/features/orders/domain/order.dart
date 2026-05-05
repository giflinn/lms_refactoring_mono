/// Mirrors the backend `fulfillment_status` enum. Drives the four tabs in
/// "Мои покупки".
enum OrderStatus { newOrder, active, completed, cancelled }

OrderStatus orderStatusFromString(String s) {
  switch (s) {
    case 'new':
      return OrderStatus.newOrder;
    case 'active':
      return OrderStatus.active;
    case 'completed':
      return OrderStatus.completed;
    case 'cancelled':
      return OrderStatus.cancelled;
  }
  throw ArgumentError('unknown fulfillment_status: $s');
}

class OrderManagerSummary {
  final String id;
  final String firstName;
  final String lastName;

  const OrderManagerSummary({
    required this.id,
    required this.firstName,
    required this.lastName,
  });

  String get fullName {
    final parts = [firstName.trim(), lastName.trim()].where((s) => s.isNotEmpty);
    return parts.join(' ');
  }
}

/// One row in the client's "Мои покупки" list.
class ClientOrder {
  final String id;
  final int orderNumber;
  final OrderStatus status;
  final num totalTenge;
  final DateTime createdAt;
  /// Computed server-side as `firstPaidAt + min(daysUntilCancel)`. NULL when
  /// the order isn't paid yet (no firstPaidAt) or has no items. Used to
  /// decide whether to show the "Отменить заказ" button.
  final DateTime? cancellationDeadline;
  final List<String> productTitles;
  final OrderManagerSummary? manager;

  const ClientOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.totalTenge,
    required this.createdAt,
    required this.cancellationDeadline,
    required this.productTitles,
    required this.manager,
  });

  bool get canCancel {
    final d = cancellationDeadline;
    if (d == null) return false;
    return d.isAfter(DateTime.now());
  }

  factory ClientOrder.fromJson(Map<String, dynamic> json) {
    final managerJson = json['manager'] as Map<String, dynamic>?;
    final deadlineRaw = json['cancellationDeadline'] as String?;
    return ClientOrder(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as int,
      status: orderStatusFromString(json['fulfillmentStatus'] as String),
      totalTenge: num.parse(json['totalTenge'].toString()),
      createdAt: DateTime.parse(json['createdAt'] as String),
      cancellationDeadline:
          deadlineRaw == null ? null : DateTime.parse(deadlineRaw),
      productTitles: (json['productTitles'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
      manager: managerJson == null
          ? null
          : OrderManagerSummary(
              id: managerJson['id'] as String,
              firstName: (managerJson['firstName'] as String?) ?? '',
              lastName: (managerJson['lastName'] as String?) ?? '',
            ),
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

/// "28 марта, 2024, 09:12" — Figma format for the order card date row.
String formatOrderDate(DateTime d) {
  final local = d.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '${local.day} ${_ruMonthsGenitive[local.month - 1]}, ${local.year}, $hh:$mm';
}

/// "30 000" — same thousands-separator look as the cart total.
String formatOrderTenge(num value) {
  final whole = value.toInt();
  final s = whole.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
    buf.write(s[i]);
  }
  return buf.toString();
}
