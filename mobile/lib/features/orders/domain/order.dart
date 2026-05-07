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

/// Set on each order while a manager is reviewing the client's cancel
/// request. Drives the "Отменить заказ" button gating on the active tab.
class PendingCancellationSummary {
  final String id;
  final DateTime createdAt;

  const PendingCancellationSummary({required this.id, required this.createdAt});
}

/// Single line item inside a client order. Used by the order card (titles)
/// and by the review submission picker (productId).
class OrderItemSummary {
  final String productId;
  final String productTitle;

  const OrderItemSummary({required this.productId, required this.productTitle});

  factory OrderItemSummary.fromJson(Map<String, dynamic> json) {
    return OrderItemSummary(
      productId: json['productId'] as String,
      productTitle: json['productTitle'] as String,
    );
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
  /// Non-null while a 'requested' cancellation is awaiting staff decision —
  /// the cancel button is replaced by a "Запрос отправлен" hint.
  final PendingCancellationSummary? pendingCancellation;
  final List<OrderItemSummary> items;
  final OrderManagerSummary? manager;

  const ClientOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.totalTenge,
    required this.createdAt,
    required this.cancellationDeadline,
    required this.pendingCancellation,
    required this.items,
    required this.manager,
  });

  List<String> get productTitles => items.map((i) => i.productTitle).toList();

  bool get canCancel {
    if (pendingCancellation != null) return false;
    final d = cancellationDeadline;
    if (d == null) return false;
    return d.isAfter(DateTime.now());
  }

  factory ClientOrder.fromJson(Map<String, dynamic> json) {
    final managerJson = json['manager'] as Map<String, dynamic>?;
    final deadlineRaw = json['cancellationDeadline'] as String?;
    final pendingJson = json['pendingCancellation'] as Map<String, dynamic>?;
    return ClientOrder(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as int,
      status: orderStatusFromString(json['fulfillmentStatus'] as String),
      totalTenge: num.parse(json['totalTenge'].toString()),
      createdAt: DateTime.parse(json['createdAt'] as String),
      cancellationDeadline:
          deadlineRaw == null ? null : DateTime.parse(deadlineRaw),
      pendingCancellation: pendingJson == null
          ? null
          : PendingCancellationSummary(
              id: pendingJson['id'] as String,
              createdAt: DateTime.parse(pendingJson['createdAt'] as String),
            ),
      items: (json['items'] as List<dynamic>?)
              ?.map((e) =>
                  OrderItemSummary.fromJson(e as Map<String, dynamic>))
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

/// Telegram chat type echoed from the backend's serializer. Only relevant
/// when the parent OrderDetailItem represents a Telegram-grant purchase.
enum OrderTelegramChatType { channel, supergroup }

OrderTelegramChatType _telegramChatTypeFromString(String s) =>
    s == 'channel'
        ? OrderTelegramChatType.channel
        : OrderTelegramChatType.supergroup;

/// Telegram membership state echoed from the backend, mirrors the DB enum.
enum OrderTelegramMembershipStatus { pending, joined, left, kicked, revoked }

OrderTelegramMembershipStatus _telegramMembershipStatusFromString(String s) {
  switch (s) {
    case 'pending':
      return OrderTelegramMembershipStatus.pending;
    case 'joined':
      return OrderTelegramMembershipStatus.joined;
    case 'left':
      return OrderTelegramMembershipStatus.left;
    case 'kicked':
      return OrderTelegramMembershipStatus.kicked;
    case 'revoked':
      return OrderTelegramMembershipStatus.revoked;
  }
  throw ArgumentError('unknown telegram_membership_status: $s');
}

class OrderTelegramGroup {
  final String id;
  final String title;
  final OrderTelegramChatType chatType;
  final String? inviteUsername;
  final String? description;

  const OrderTelegramGroup({
    required this.id,
    required this.title,
    required this.chatType,
    required this.inviteUsername,
    required this.description,
  });

  String get kindLabel => chatType == OrderTelegramChatType.channel
      ? 'Telegram-канал'
      : 'Telegram-группа';

  factory OrderTelegramGroup.fromJson(Map<String, dynamic> json) {
    return OrderTelegramGroup(
      id: json['id'] as String,
      title: json['title'] as String,
      chatType: _telegramChatTypeFromString(json['chatType'] as String),
      inviteUsername: json['inviteUsername'] as String?,
      description: json['description'] as String?,
    );
  }
}

class OrderTelegramMembership {
  final String id;
  final OrderTelegramMembershipStatus status;
  final String? inviteLink;
  final DateTime? joinedAt;
  final DateTime? expiresAt;

  const OrderTelegramMembership({
    required this.id,
    required this.status,
    required this.inviteLink,
    required this.joinedAt,
    required this.expiresAt,
  });

  bool get isActive =>
      status == OrderTelegramMembershipStatus.pending ||
      status == OrderTelegramMembershipStatus.joined;

  factory OrderTelegramMembership.fromJson(Map<String, dynamic> json) {
    return OrderTelegramMembership(
      id: json['id'] as String,
      status: _telegramMembershipStatusFromString(json['status'] as String),
      inviteLink: json['inviteLink'] as String?,
      joinedAt: (json['joinedAt'] as String?) != null
          ? DateTime.parse(json['joinedAt'] as String)
          : null,
      expiresAt: (json['expiresAt'] as String?) != null
          ? DateTime.parse(json['expiresAt'] as String)
          : null,
    );
  }
}

/// Slim summary of the LMS course associated with an order item, when the
/// underlying product has an lmsCourseId set.
class OrderLmsCourse {
  final String id;
  final String title;
  final String? coverImageUrl;

  const OrderLmsCourse({
    required this.id,
    required this.title,
    required this.coverImageUrl,
  });

  factory OrderLmsCourse.fromJson(Map<String, dynamic> json) {
    return OrderLmsCourse(
      id: json['id'] as String,
      title: json['title'] as String,
      coverImageUrl: json['coverImageUrl'] as String?,
    );
  }
}

/// One row in the per-order detail page. Carries enough info for the three
/// fulfilment-kind variants: bookable (booked range + slot info), Telegram
/// grant (group + membership state), LMS course (course summary). When none
/// of those are set, the row renders as a plain product.
class ClientOrderDetailItem {
  final String id;
  final String productId;
  final String productTitle;
  final String productCategoryName;
  final String? productSubtitle;
  final String? productDescription;
  final String unitPriceTenge;
  final int quantity;
  final DateTime? bookedStart;
  final DateTime? bookedEnd;
  final DateTime? expiresAt;
  final int? durationMinutes;
  final OrderTelegramGroup? telegramGroup;
  final OrderTelegramMembership? telegramMembership;
  final OrderLmsCourse? lmsCourse;

  const ClientOrderDetailItem({
    required this.id,
    required this.productId,
    required this.productTitle,
    required this.productCategoryName,
    required this.productSubtitle,
    required this.productDescription,
    required this.unitPriceTenge,
    required this.quantity,
    required this.bookedStart,
    required this.bookedEnd,
    required this.expiresAt,
    required this.durationMinutes,
    required this.telegramGroup,
    required this.telegramMembership,
    required this.lmsCourse,
  });

  bool get isBooking => bookedStart != null && bookedEnd != null;
  bool get isTelegram => telegramGroup != null;
  bool get isLmsCourse => lmsCourse != null;

  factory ClientOrderDetailItem.fromJson(Map<String, dynamic> json) {
    return ClientOrderDetailItem(
      id: json['id'] as String,
      productId: json['productId'] as String,
      productTitle: json['productTitle'] as String,
      productCategoryName: json['productCategoryName'] as String,
      productSubtitle: json['productSubtitle'] as String?,
      productDescription: json['productDescription'] as String?,
      unitPriceTenge: json['unitPriceTenge'].toString(),
      quantity: (json['quantity'] as num).toInt(),
      bookedStart: (json['bookedStart'] as String?) != null
          ? DateTime.parse(json['bookedStart'] as String)
          : null,
      bookedEnd: (json['bookedEnd'] as String?) != null
          ? DateTime.parse(json['bookedEnd'] as String)
          : null,
      expiresAt: (json['expiresAt'] as String?) != null
          ? DateTime.parse(json['expiresAt'] as String)
          : null,
      durationMinutes: (json['durationMinutes'] as num?)?.toInt(),
      telegramGroup: (json['telegramGroup'] as Map<String, dynamic>?) == null
          ? null
          : OrderTelegramGroup.fromJson(
              json['telegramGroup'] as Map<String, dynamic>),
      telegramMembership:
          (json['telegramMembership'] as Map<String, dynamic>?) == null
              ? null
              : OrderTelegramMembership.fromJson(
                  json['telegramMembership'] as Map<String, dynamic>),
      lmsCourse: (json['lmsCourse'] as Map<String, dynamic>?) == null
          ? null
          : OrderLmsCourse.fromJson(
              json['lmsCourse'] as Map<String, dynamic>),
    );
  }
}

class ClientOrderDetail {
  final String id;
  final int orderNumber;
  final OrderStatus status;
  final String paymentStatus;
  final num totalTenge;
  final DateTime createdAt;
  final DateTime? firstPaidAt;
  final DateTime statusChangedAt;
  final OrderManagerSummary? manager;
  final List<ClientOrderDetailItem> items;

  const ClientOrderDetail({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.paymentStatus,
    required this.totalTenge,
    required this.createdAt,
    required this.firstPaidAt,
    required this.statusChangedAt,
    required this.manager,
    required this.items,
  });

  factory ClientOrderDetail.fromJson(Map<String, dynamic> json) {
    final managerJson = json['manager'] as Map<String, dynamic>?;
    return ClientOrderDetail(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as int,
      status: orderStatusFromString(json['fulfillmentStatus'] as String),
      paymentStatus: json['paymentStatus'] as String,
      totalTenge: num.parse(json['totalTenge'].toString()),
      createdAt: DateTime.parse(json['createdAt'] as String),
      firstPaidAt: (json['firstPaidAt'] as String?) != null
          ? DateTime.parse(json['firstPaidAt'] as String)
          : null,
      statusChangedAt: DateTime.parse(json['statusChangedAt'] as String),
      manager: managerJson == null
          ? null
          : OrderManagerSummary(
              id: managerJson['id'] as String,
              firstName: (managerJson['firstName'] as String?) ?? '',
              lastName: (managerJson['lastName'] as String?) ?? '',
            ),
      items: (json['items'] as List<dynamic>?)
              ?.map((e) =>
                  ClientOrderDetailItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
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
