// Staff-side order types. Mirror the payload from `/orders` (list +
// pagination) and `/orders/:id` (detail with items). Kept separate from
// ClientOrder in `order.dart` because the staff payload has different
// fields (client/manager summaries, items count, payment status, item
// booking ranges) and the lifecycle differs (no cancellation deadline,
// no pendingCancellation surface — those are client-only concerns).

/// Backend `payment_status` enum.
enum PaymentStatus { pending, paid, unpaid, refunded }

PaymentStatus paymentStatusFromString(String s) {
  switch (s) {
    case 'pending':
      return PaymentStatus.pending;
    case 'paid':
      return PaymentStatus.paid;
    case 'unpaid':
      return PaymentStatus.unpaid;
    case 'refunded':
      return PaymentStatus.refunded;
  }
  throw ArgumentError('unknown payment_status: $s');
}

String paymentStatusToString(PaymentStatus s) => switch (s) {
      PaymentStatus.pending => 'pending',
      PaymentStatus.paid => 'paid',
      PaymentStatus.unpaid => 'unpaid',
      PaymentStatus.refunded => 'refunded',
    };

String paymentStatusLabel(PaymentStatus s) => switch (s) {
      PaymentStatus.pending => 'Ожидает оплаты',
      PaymentStatus.paid => 'Оплачено',
      PaymentStatus.unpaid => 'Не оплачено',
      PaymentStatus.refunded => 'Возврат',
    };

/// Backend `fulfillment_status` enum. Same set the client sees but reused
/// here without mapping through [OrderStatus] so staff code doesn't have to
/// translate enums when calling the patch endpoint.
enum FulfillmentStatus { newOrder, active, completed, cancelled }

FulfillmentStatus fulfillmentStatusFromString(String s) {
  switch (s) {
    case 'new':
      return FulfillmentStatus.newOrder;
    case 'active':
      return FulfillmentStatus.active;
    case 'completed':
      return FulfillmentStatus.completed;
    case 'cancelled':
      return FulfillmentStatus.cancelled;
  }
  throw ArgumentError('unknown fulfillment_status: $s');
}

String fulfillmentStatusToString(FulfillmentStatus s) => switch (s) {
      FulfillmentStatus.newOrder => 'new',
      FulfillmentStatus.active => 'active',
      FulfillmentStatus.completed => 'completed',
      FulfillmentStatus.cancelled => 'cancelled',
    };

String fulfillmentStatusLabel(FulfillmentStatus s) => switch (s) {
      FulfillmentStatus.newOrder => 'Новый',
      FulfillmentStatus.active => 'Активный',
      FulfillmentStatus.completed => 'Завершен',
      FulfillmentStatus.cancelled => 'Отменен',
    };

class StaffOrderUserSummary {
  final String id;
  final String firstName;
  final String lastName;
  final String email;
  final String? avatarUrl;

  const StaffOrderUserSummary({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.avatarUrl,
  });

  String get fullName {
    final parts = [firstName.trim(), lastName.trim()].where((s) => s.isNotEmpty);
    return parts.join(' ');
  }

  factory StaffOrderUserSummary.fromJson(Map<String, dynamic> json) {
    return StaffOrderUserSummary(
      id: json['id'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
      avatarUrl: json['avatarUrl'] as String?,
    );
  }
}

/// One row in the staff orders list.
class StaffOrder {
  final String id;
  final int orderNumber;
  final PaymentStatus paymentStatus;
  final FulfillmentStatus fulfillmentStatus;
  final num totalTenge;
  final int itemsCount;
  final DateTime createdAt;
  final DateTime? firstPaidAt;
  final StaffOrderUserSummary client;
  final StaffOrderUserSummary? manager;

  const StaffOrder({
    required this.id,
    required this.orderNumber,
    required this.paymentStatus,
    required this.fulfillmentStatus,
    required this.totalTenge,
    required this.itemsCount,
    required this.createdAt,
    required this.firstPaidAt,
    required this.client,
    required this.manager,
  });

  factory StaffOrder.fromJson(Map<String, dynamic> json) {
    return StaffOrder(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as int,
      paymentStatus:
          paymentStatusFromString(json['paymentStatus'] as String),
      fulfillmentStatus:
          fulfillmentStatusFromString(json['fulfillmentStatus'] as String),
      totalTenge: num.parse(json['totalTenge'].toString()),
      itemsCount: json['itemsCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      firstPaidAt: json['firstPaidAt'] == null
          ? null
          : DateTime.parse(json['firstPaidAt'] as String),
      client: StaffOrderUserSummary.fromJson(
        json['client'] as Map<String, dynamic>,
      ),
      manager: json['manager'] == null
          ? null
          : StaffOrderUserSummary.fromJson(
              json['manager'] as Map<String, dynamic>,
            ),
    );
  }
}

class StaffOrderItem {
  final String id;
  final String productId;
  final String productTitle;
  final String productCategoryName;
  final String? productSubtitle;
  final num unitPriceTenge;
  final int quantity;
  final DateTime? bookedStart;
  final DateTime? bookedEnd;
  final DateTime? expiresAt;

  const StaffOrderItem({
    required this.id,
    required this.productId,
    required this.productTitle,
    required this.productCategoryName,
    required this.productSubtitle,
    required this.unitPriceTenge,
    required this.quantity,
    required this.bookedStart,
    required this.bookedEnd,
    required this.expiresAt,
  });

  factory StaffOrderItem.fromJson(Map<String, dynamic> json) {
    return StaffOrderItem(
      id: json['id'] as String,
      productId: json['productId'] as String,
      productTitle: json['productTitle'] as String,
      productCategoryName: json['productCategoryName'] as String,
      productSubtitle: json['productSubtitle'] as String?,
      unitPriceTenge: num.parse(json['unitPriceTenge'].toString()),
      quantity: json['quantity'] as int,
      bookedStart: json['bookedStart'] == null
          ? null
          : DateTime.parse(json['bookedStart'] as String),
      bookedEnd: json['bookedEnd'] == null
          ? null
          : DateTime.parse(json['bookedEnd'] as String),
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
    );
  }
}

class StaffOrderDetail {
  final String id;
  final int orderNumber;
  final PaymentStatus paymentStatus;
  final FulfillmentStatus fulfillmentStatus;
  final num totalTenge;
  final DateTime createdAt;
  final DateTime? firstPaidAt;
  final StaffOrderUserSummary client;
  final StaffOrderUserSummary? manager;
  final List<StaffOrderItem> items;

  const StaffOrderDetail({
    required this.id,
    required this.orderNumber,
    required this.paymentStatus,
    required this.fulfillmentStatus,
    required this.totalTenge,
    required this.createdAt,
    required this.firstPaidAt,
    required this.client,
    required this.manager,
    required this.items,
  });

  StaffOrderDetail copyWith({
    PaymentStatus? paymentStatus,
    FulfillmentStatus? fulfillmentStatus,
    DateTime? firstPaidAt,
  }) {
    return StaffOrderDetail(
      id: id,
      orderNumber: orderNumber,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      fulfillmentStatus: fulfillmentStatus ?? this.fulfillmentStatus,
      totalTenge: totalTenge,
      createdAt: createdAt,
      firstPaidAt: firstPaidAt ?? this.firstPaidAt,
      client: client,
      manager: manager,
      items: items,
    );
  }

  factory StaffOrderDetail.fromJson(Map<String, dynamic> json) {
    return StaffOrderDetail(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as int,
      paymentStatus:
          paymentStatusFromString(json['paymentStatus'] as String),
      fulfillmentStatus:
          fulfillmentStatusFromString(json['fulfillmentStatus'] as String),
      totalTenge: num.parse(json['totalTenge'].toString()),
      createdAt: DateTime.parse(json['createdAt'] as String),
      firstPaidAt: json['firstPaidAt'] == null
          ? null
          : DateTime.parse(json['firstPaidAt'] as String),
      client: StaffOrderUserSummary.fromJson(
        json['client'] as Map<String, dynamic>,
      ),
      manager: json['manager'] == null
          ? null
          : StaffOrderUserSummary.fromJson(
              json['manager'] as Map<String, dynamic>,
            ),
      items: (json['items'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(StaffOrderItem.fromJson)
          .toList(),
    );
  }
}

class StaffOrdersPage {
  final List<StaffOrder> orders;
  final int page;
  final int pageSize;
  final int total;

  const StaffOrdersPage({
    required this.orders,
    required this.page,
    required this.pageSize,
    required this.total,
  });

  factory StaffOrdersPage.fromJson(Map<String, dynamic> json) {
    return StaffOrdersPage(
      orders: (json['orders'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(StaffOrder.fromJson)
          .toList(),
      page: json['page'] as int,
      pageSize: json['pageSize'] as int,
      total: json['total'] as int,
    );
  }
}

const _ruMonthsTitle = [
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

/// "Март 2024" — section header for the staff list (one section per
/// year+month of `createdAt`, descending).
String formatYearMonthHeader(DateTime d) {
  final local = d.toLocal();
  return '${_ruMonthsTitle[local.month - 1]} ${local.year}';
}

const _ruMonthsTitleNominative = [
  'Января',
  'Февраля',
  'Марта',
  'Апреля',
  'Мая',
  'Июня',
  'Июля',
  'Августа',
  'Сентября',
  'Октября',
  'Ноября',
  'Декабря',
];

/// "19 Марта, 12:00 - 14:00" — booking-range row inside the order detail
/// item card. Mirrors the admin web `formatBookingRange`.
String formatBookingRange(DateTime start, DateTime end) {
  final s = start.toLocal();
  final e = end.toLocal();
  final day = s.day;
  final month = _ruMonthsTitleNominative[s.month - 1];
  final sh = s.hour.toString().padLeft(2, '0');
  final sm = s.minute.toString().padLeft(2, '0');
  final eh = e.hour.toString().padLeft(2, '0');
  final em = e.minute.toString().padLeft(2, '0');
  return '$day $month, $sh:$sm - $eh:$em';
}
