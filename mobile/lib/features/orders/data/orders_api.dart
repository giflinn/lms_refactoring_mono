import 'dart:convert';
import 'dart:io';
import '../../../core/network/api_client.dart';
import '../domain/order.dart';
import '../domain/staff_order.dart';

/// One item in the create-order payload. Mirrors the backend's
/// CreateOrderInputItem: every product needs an id, plus an optional
/// bookedStart for bookable products (durationMinutes != null).
class CreateOrderItemInput {
  final String productId;
  final DateTime? bookedStart;

  const CreateOrderItemInput({required this.productId, this.bookedStart});
}

/// Result returned by POST /orders on success.
class CreatedOrder {
  final String id;
  final int orderNumber;

  const CreatedOrder({required this.id, required this.orderNumber});
}

/// Error returned by POST /orders. The server uses snake_case codes; the UI
/// switches on [code] to render a friendly message and decide whether to
/// keep the user on the cart or proceed.
class OrderCreationException implements Exception {
  final String code;
  final int statusCode;

  const OrderCreationException({required this.code, required this.statusCode});

  @override
  String toString() => 'OrderCreationException($code, http=$statusCode)';
}

/// Error returned by POST /me/orders/:id/cancellation. Codes worth handling
/// in the UI: `cancellation_already_pending` (we should refresh and reflect
/// the existing request), `order_not_cancellable` /
/// `cancellation_window_closed` (the order moved out from under us between
/// list refresh and tap).
class CancellationRequestException implements Exception {
  final String code;
  final int statusCode;

  const CancellationRequestException({
    required this.code,
    required this.statusCode,
  });

  @override
  String toString() =>
      'CancellationRequestException($code, http=$statusCode)';
}

/// Error returned by PATCH /orders/:id. Notable codes the staff UI must
/// handle distinctly:
/// - `booking_conflict` (409) — only emitted when reverting fulfillment from
///   `cancelled`. Re-issue with `force: true` to drop conflicting bookings.
/// - `forbidden` (403) — manager opened a deep-link to a non-own order.
class OrderPatchException implements Exception {
  final String code;
  final int statusCode;

  const OrderPatchException({required this.code, required this.statusCode});

  @override
  String toString() => 'OrderPatchException($code, http=$statusCode)';
}

class OrdersApi {
  final ApiClient _client;

  OrdersApi(this._client);

  Future<CreatedOrder> createOrder({
    required List<CreateOrderItemInput> items,
    required String idToken,
  }) async {
    final payload = {
      'items': items
          .map(
            (it) => <String, Object>{
              'productId': it.productId,
              if (it.bookedStart != null)
                'bookedStart': it.bookedStart!.toUtc().toIso8601String(),
            },
          )
          .toList(),
    };
    final res = await _client.postJson(
      '/orders',
      idToken: idToken,
      body: payload,
    );
    if (res.statusCode == 200) {
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final order = json['order'] as Map<String, dynamic>;
      return CreatedOrder(
        id: order['id'] as String,
        orderNumber: order['orderNumber'] as int,
      );
    }
    throw OrderCreationException(
      code: ApiClient.parseErrorCode(res.body),
      statusCode: res.statusCode,
    );
  }

  Future<List<ClientOrder>> listMine(String idToken) async {
    final res = await _client.get('/me/orders', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /me/orders: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['orders'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(ClientOrder.fromJson)
        .toList();
  }

  /// Submit a cancellation request for an active order. [reason] is optional;
  /// when provided it's shown to staff in the admin drawer. Throws
  /// [CancellationRequestException] on any non-200, [NetworkException] on
  /// transport failure.
  Future<String> requestCancellation({
    required String orderId,
    required String? reason,
    required String idToken,
  }) async {
    final body = <String, Object>{
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    };
    final res = await _client.postJson(
      '/me/orders/$orderId/cancellation',
      idToken: idToken,
      body: body,
    );
    if (res.statusCode == 200) {
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final cancellation = json['cancellation'] as Map<String, dynamic>;
      return cancellation['id'] as String;
    }
    throw CancellationRequestException(
      code: ApiClient.parseErrorCode(res.body),
      statusCode: res.statusCode,
    );
  }

  /// Staff list with optional search and filters. Backend already enforces
  /// RBAC (manager → only own clients' orders, senior_manager/admin → all),
  /// so the mobile side just renders what comes back.
  Future<StaffOrdersPage> listForStaff({
    required String idToken,
    String? query,
    int page = 1,
    int pageSize = 20,
    FulfillmentStatus? fulfillmentStatus,
    PaymentStatus? paymentStatus,
  }) async {
    final qp = <String>['page=$page', 'pageSize=$pageSize'];
    if (query != null && query.isNotEmpty) {
      qp.add('q=${Uri.encodeQueryComponent(query)}');
    }
    if (fulfillmentStatus != null) {
      qp.add('fulfillmentStatus=${fulfillmentStatusToString(fulfillmentStatus)}');
    }
    if (paymentStatus != null) {
      qp.add('paymentStatus=${paymentStatusToString(paymentStatus)}');
    }
    final path = '/orders?${qp.join('&')}';
    final res = await _client.get(path, idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET $path: ${res.statusCode}');
    }
    return StaffOrdersPage.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<StaffOrderDetail> getOrder({
    required String idToken,
    required String orderId,
  }) async {
    final res = await _client.get('/orders/$orderId', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /orders/$orderId: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return StaffOrderDetail.fromJson(
      json['order'] as Map<String, dynamic>,
    );
  }

  /// PATCH /orders/:id — change payment and/or fulfillment status. At least
  /// one of [paymentStatus] / [fulfillmentStatus] must be non-null. [force]
  /// is honored only on a fulfillment revert from `cancelled` and lets the
  /// caller drop conflicting bookings (the same `force=true` the admin web
  /// drawer uses after the BookingConflictDialog).
  Future<StaffOrder> patchOrder({
    required String idToken,
    required String orderId,
    PaymentStatus? paymentStatus,
    FulfillmentStatus? fulfillmentStatus,
    bool force = false,
  }) async {
    final body = <String, Object>{
      if (paymentStatus != null)
        'paymentStatus': paymentStatusToString(paymentStatus),
      if (fulfillmentStatus != null)
        'fulfillmentStatus': fulfillmentStatusToString(fulfillmentStatus),
      if (force) 'force': true,
    };
    final res = await _client.patchJson(
      '/orders/$orderId',
      idToken: idToken,
      body: body,
    );
    if (res.statusCode == 200) {
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return StaffOrder.fromJson(json['order'] as Map<String, dynamic>);
    }
    throw OrderPatchException(
      code: ApiClient.parseErrorCode(res.body),
      statusCode: res.statusCode,
    );
  }
}
