import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

/// Thin wrapper around StoreKit (`in_app_purchase`) for the iOS digital-goods
/// checkout. ONLY used behind `Platform.isIOS` — Android never touches this.
///
/// Flow: [buy] launches a consumable purchase and resolves when StoreKit
/// reaches a terminal state. The caller then verifies the transaction on our
/// server and, only after the server grants access, calls [complete] to finish
/// the StoreKit transaction. We treat each purchase as a consumable and keep
/// the entitlement on our server (tied to the order), so no "restore" is needed.
class ApplePurchaseException implements Exception {
  /// 'unavailable' | 'product_not_found' | 'cancelled' | 'failed' |
  /// 'no_transaction_id'
  final String code;
  final String? message;

  const ApplePurchaseException(this.code, [this.message]);

  @override
  String toString() => 'ApplePurchaseException($code, $message)';
}

class ApplePurchaser {
  final InAppPurchase _iap;

  ApplePurchaser([InAppPurchase? iap]) : _iap = iap ?? InAppPurchase.instance;

  /// Localized StoreKit price string for [productId] (e.g. "₸4 990"), or null
  /// when the store is unavailable or the product isn't configured. Used to
  /// show Apple's price (not our tenge price) for digital goods on iOS.
  Future<ProductDetails?> productDetails(String productId) async {
    if (!await _iap.isAvailable()) return null;
    final resp = await _iap.queryProductDetails({productId});
    final match = resp.productDetails.where((p) => p.id == productId);
    return match.isEmpty ? null : match.first;
  }

  /// Launch a consumable purchase and resolve with the terminal
  /// [PurchaseDetails] on success. Throws [ApplePurchaseException] on
  /// cancel/error/unavailable. The caller MUST call [complete] after the server
  /// has verified+granted, to finish the transaction.
  Future<PurchaseDetails> buy(String productId) async {
    if (!await _iap.isAvailable()) {
      throw const ApplePurchaseException('unavailable');
    }
    final resp = await _iap.queryProductDetails({productId});
    final matches = resp.productDetails.where((p) => p.id == productId);
    if (matches.isEmpty) {
      throw const ApplePurchaseException('product_not_found');
    }
    final product = matches.first;

    final completer = Completer<PurchaseDetails>();
    late final StreamSubscription<List<PurchaseDetails>> sub;
    sub = _iap.purchaseStream.listen(
      (purchases) async {
        for (final p in purchases) {
          if (p.productID != productId) continue;
          switch (p.status) {
            case PurchaseStatus.pending:
              break; // keep waiting
            case PurchaseStatus.purchased:
            case PurchaseStatus.restored:
              if (!completer.isCompleted) completer.complete(p);
              await sub.cancel();
              return;
            case PurchaseStatus.error:
              if (!completer.isCompleted) {
                completer.completeError(
                  ApplePurchaseException('failed', p.error?.message),
                );
              }
              await sub.cancel();
              return;
            case PurchaseStatus.canceled:
              if (!completer.isCompleted) {
                completer.completeError(
                  const ApplePurchaseException('cancelled'),
                );
              }
              await sub.cancel();
              return;
          }
        }
      },
      onError: (Object e) {
        if (!completer.isCompleted) {
          completer.completeError(ApplePurchaseException('failed', '$e'));
        }
        sub.cancel();
      },
    );

    final bool started;
    try {
      started = await _iap.buyConsumable(
        purchaseParam: PurchaseParam(productDetails: product),
      );
    } catch (e) {
      await sub.cancel();
      throw ApplePurchaseException('failed', '$e');
    }
    if (!started && !completer.isCompleted) {
      await sub.cancel();
      throw const ApplePurchaseException('failed');
    }
    return completer.future;
  }

  /// Finish the StoreKit transaction. Call only after the server has granted
  /// access, otherwise StoreKit re-delivers the transaction on next launch.
  Future<void> complete(PurchaseDetails details) =>
      _iap.completePurchase(details);
}

final applePurchaserProvider = Provider<ApplePurchaser>(
  (ref) => ApplePurchaser(),
);
