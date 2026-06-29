import 'dart:convert';

import '../../../core/network/api_client.dart';

/// Error from the Apple IAP verify endpoint. Codes worth distinct UI handling:
///   payment_unavailable        — Apple IAP not configured on the server (503)
///   apple_tx_product_mismatch  — transaction is for a different product
///   order_not_found / order_not_digital — shouldn't happen via normal flow
class AppleIapException implements Exception {
  final String code;
  final int statusCode;

  const AppleIapException({required this.code, required this.statusCode});

  @override
  String toString() => 'AppleIapException($code, http=$statusCode)';
}

class AppleIapApi {
  final ApiClient _client;

  AppleIapApi(this._client);

  /// Confirms an iOS StoreKit purchase against a pending order. The backend
  /// verifies the transaction with Apple (App Store Server API) and settles the
  /// order to 'paid' on success — granting course/Telegram access through the
  /// same path as a BCC card payment. Idempotent server-side (unique
  /// transactionId). Returns the order's resulting payment status.
  Future<String> verify({
    required String orderId,
    required String transactionId,
    required String idToken,
  }) async {
    final res = await _client.postJson(
      '/payments/apple/verify',
      body: {'orderId': orderId, 'transactionId': transactionId},
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw AppleIapException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['paymentStatus'] as String?) ?? 'pending';
  }
}
