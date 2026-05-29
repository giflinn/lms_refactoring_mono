import 'dart:convert';

import '../../../core/network/api_client.dart';

/// Result of POST /payments. The WebView loads [checkoutUrl]; a navigation to
/// [returnUrl] (BACKREF) means the bank flow finished and we should poll
/// status. Never treat the return navigation itself as success — the backend
/// (verified callback + TRTYPE=90) is the source of truth.
class StartedPayment {
  final String paymentId;
  final String checkoutUrl;
  final String returnUrl;

  const StartedPayment({
    required this.paymentId,
    required this.checkoutUrl,
    required this.returnUrl,
  });

  factory StartedPayment.fromJson(Map<String, dynamic> json) => StartedPayment(
    paymentId: json['paymentId'] as String,
    checkoutUrl: json['checkoutUrl'] as String,
    returnUrl: json['returnUrl'] as String,
  );
}

/// Provider-side payment state from GET /payments/:id. status ∈
/// pending | paid | failed.
class PaymentStatusResult {
  final String status;
  final String? rc;
  final String? rcText;

  const PaymentStatusResult({required this.status, this.rc, this.rcText});

  bool get isPaid => status == 'paid';
  bool get isFailed => status == 'failed';

  factory PaymentStatusResult.fromJson(Map<String, dynamic> json) =>
      PaymentStatusResult(
        status: json['status'] as String,
        rc: json['rc'] as String?,
        rcText: json['rcText'] as String?,
      );
}

/// Error from /payments endpoints. Codes worth distinct UI handling:
///   order_not_payable   — order already paid/cancelled (refresh, go to orders)
///   payment_unavailable — BCC not configured on the server
///   order_not_found / forbidden — shouldn't happen via normal flow
class PaymentException implements Exception {
  final String code;
  final int statusCode;

  const PaymentException({required this.code, required this.statusCode});

  @override
  String toString() => 'PaymentException($code, http=$statusCode)';
}

class BccPaymentApi {
  final ApiClient _client;

  BccPaymentApi(this._client);

  /// Start a card payment for a pending order. Returns the checkout/return URLs.
  Future<StartedPayment> start({
    required String orderId,
    required String idToken,
  }) async {
    final res = await _client.postJson(
      '/payments',
      body: {'orderId': orderId},
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw PaymentException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
    return StartedPayment.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  /// Poll the payment status. The backend nudges BCC (TRTYPE=90) if a callback
  /// hasn't landed yet, so this reflects the authoritative state.
  Future<PaymentStatusResult> status({
    required String paymentId,
    required String idToken,
  }) async {
    final res = await _client.get('/payments/$paymentId', idToken: idToken);
    if (res.statusCode != 200) {
      throw PaymentException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
    return PaymentStatusResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }
}
