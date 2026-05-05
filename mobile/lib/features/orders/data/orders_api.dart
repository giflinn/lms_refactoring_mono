import 'dart:convert';
import 'dart:io';
import '../../../core/network/api_client.dart';
import '../domain/order.dart';

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
}
