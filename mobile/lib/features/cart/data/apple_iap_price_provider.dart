import 'dart:io' show Platform;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'apple_iap_purchaser.dart';

/// StoreKit-localized price string for an iOS IAP product (e.g. "58 990,00 ₸"),
/// or null on non-iOS and when the store is unavailable / the product isn't
/// configured yet.
///
/// Digital goods on iOS are sold via Apple IAP at a price that is grossed up
/// to offset Apple's commission, so the App Store charge is higher than the
/// base tenge price (which is the Android/Kaspi price). To keep the iOS flow
/// consistent — catalog, cart, and the StoreKit sheet all showing the SAME
/// amount the user will actually be charged — those surfaces display this
/// value instead of `product.price`. Cached per product id (family) so the
/// StoreKit lookup happens once. Non-iOS returns null immediately and never
/// touches StoreKit, so Android behaviour is unchanged.
final iosIapPriceProvider = FutureProvider.family<String?, String>((
  ref,
  iapProductId,
) async {
  if (!Platform.isIOS) return null;
  final pd = await ref.read(applePurchaserProvider).productDetails(iapProductId);
  return pd?.price;
});
