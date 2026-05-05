import '../../orders/domain/staff_order.dart'
    show
        FulfillmentStatus,
        PaymentStatus,
        StaffOrderItem,
        StaffOrderUserSummary,
        fulfillmentStatusFromString,
        paymentStatusFromString;

/// Backend `cancellation_status` enum.
enum CancellationStatus { requested, approved, rejected }

CancellationStatus cancellationStatusFromString(String s) {
  switch (s) {
    case 'requested':
      return CancellationStatus.requested;
    case 'approved':
      return CancellationStatus.approved;
    case 'rejected':
      return CancellationStatus.rejected;
  }
  throw ArgumentError('unknown cancellation_status: $s');
}

String cancellationStatusToString(CancellationStatus s) => switch (s) {
      CancellationStatus.requested => 'requested',
      CancellationStatus.approved => 'approved',
      CancellationStatus.rejected => 'rejected',
    };

String cancellationStatusLabel(CancellationStatus s) => switch (s) {
      CancellationStatus.requested => 'Запрошено',
      CancellationStatus.approved => 'Одобрено',
      CancellationStatus.rejected => 'Отказано',
    };

/// One row in the staff cancellations list.
class StaffCancellation {
  final String id;
  final String orderId;
  final int orderNumber;
  final CancellationStatus status;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final StaffOrderUserSummary client;
  final StaffOrderUserSummary? manager;

  const StaffCancellation({
    required this.id,
    required this.orderId,
    required this.orderNumber,
    required this.status,
    required this.createdAt,
    required this.decidedAt,
    required this.client,
    required this.manager,
  });

  factory StaffCancellation.fromJson(Map<String, dynamic> json) {
    return StaffCancellation(
      id: json['id'] as String,
      orderId: json['orderId'] as String,
      orderNumber: json['orderNumber'] as int,
      status: cancellationStatusFromString(json['status'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
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

class StaffCancellationDetail {
  final String id;
  final String orderId;
  final int orderNumber;
  final num orderTotalTenge;
  final FulfillmentStatus orderFulfillmentStatus;
  final PaymentStatus orderPaymentStatus;
  final CancellationStatus status;
  final String? clientReason;
  final String? decisionComment;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final StaffOrderUserSummary client;
  final StaffOrderUserSummary? manager;
  final StaffOrderUserSummary? decidedBy;
  final List<StaffOrderItem> items;

  const StaffCancellationDetail({
    required this.id,
    required this.orderId,
    required this.orderNumber,
    required this.orderTotalTenge,
    required this.orderFulfillmentStatus,
    required this.orderPaymentStatus,
    required this.status,
    required this.clientReason,
    required this.decisionComment,
    required this.createdAt,
    required this.decidedAt,
    required this.client,
    required this.manager,
    required this.decidedBy,
    required this.items,
  });

  factory StaffCancellationDetail.fromJson(Map<String, dynamic> json) {
    return StaffCancellationDetail(
      id: json['id'] as String,
      orderId: json['orderId'] as String,
      orderNumber: json['orderNumber'] as int,
      orderTotalTenge: num.parse(json['orderTotalTenge'].toString()),
      orderFulfillmentStatus: fulfillmentStatusFromString(
        json['orderFulfillmentStatus'] as String,
      ),
      orderPaymentStatus: paymentStatusFromString(
        json['orderPaymentStatus'] as String,
      ),
      status: cancellationStatusFromString(json['status'] as String),
      clientReason: json['clientReason'] as String?,
      decisionComment: json['decisionComment'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
      client: StaffOrderUserSummary.fromJson(
        json['client'] as Map<String, dynamic>,
      ),
      manager: json['manager'] == null
          ? null
          : StaffOrderUserSummary.fromJson(
              json['manager'] as Map<String, dynamic>,
            ),
      decidedBy: json['decidedBy'] == null
          ? null
          : StaffOrderUserSummary.fromJson(
              json['decidedBy'] as Map<String, dynamic>,
            ),
      items: (json['items'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(StaffOrderItem.fromJson)
          .toList(),
    );
  }
}

class StaffCancellationsPage {
  final List<StaffCancellation> cancellations;
  final int page;
  final int pageSize;
  final int total;

  const StaffCancellationsPage({
    required this.cancellations,
    required this.page,
    required this.pageSize,
    required this.total,
  });

  factory StaffCancellationsPage.fromJson(Map<String, dynamic> json) {
    return StaffCancellationsPage(
      cancellations: (json['cancellations'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(StaffCancellation.fromJson)
          .toList(),
      page: json['page'] as int,
      pageSize: json['pageSize'] as int,
      total: json['total'] as int,
    );
  }
}
