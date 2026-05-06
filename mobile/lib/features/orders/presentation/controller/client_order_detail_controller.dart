import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/orders_api_provider.dart';
import '../../domain/order.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

/// Per-order detail controller, family-keyed by orderId. Mirrors the staff
/// version's constructor-arg + AsyncNotifier pattern (see
/// staffOrderDetailProvider). Auto-disposed so navigating away frees state.
class ClientOrderDetailController extends AsyncNotifier<ClientOrderDetail> {
  ClientOrderDetailController(this.orderId);

  final String orderId;

  @override
  Future<ClientOrderDetail> build() async {
    final token = await _idToken();
    return ref
        .read(ordersApiProvider)
        .getMyOrder(orderId: orderId, idToken: token);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final token = await _idToken();
      return ref
          .read(ordersApiProvider)
          .getMyOrder(orderId: orderId, idToken: token);
    });
  }

  /// Returns the per-user invite link for a Telegram-grant item. The page
  /// catches `telegram_not_linked` and switches to the link flow rather than
  /// surfacing this as an error.
  Future<String> requestTelegramInvite(String itemId) async {
    final token = await _idToken();
    return ref.read(ordersApiProvider).requestTelegramInvite(
          orderId: orderId,
          itemId: itemId,
          idToken: token,
        );
  }
}

final clientOrderDetailProvider = AsyncNotifierProvider.autoDispose
    .family<ClientOrderDetailController, ClientOrderDetail, String>(
  ClientOrderDetailController.new,
);
