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

/// Loads the calling client's purchases. Powers the four tabs in
/// "Мои покупки" plus the cabinet badge dot ("есть новый заказ").
class ClientOrdersController extends AsyncNotifier<List<ClientOrder>> {
  @override
  Future<List<ClientOrder>> build() async {
    final token = await _idToken();
    return ref.read(ordersApiProvider).listMine(token);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final token = await _idToken();
      return ref.read(ordersApiProvider).listMine(token);
    });
  }
}

final clientOrdersProvider =
    AsyncNotifierProvider<ClientOrdersController, List<ClientOrder>>(
  ClientOrdersController.new,
);

/// True when at least one order is in `new` status — drives the badge dot
/// next to the "Новые" tab and on the cabinet "Мои покупки" row.
final hasNewOrdersProvider = Provider<bool>((ref) {
  final orders = ref.watch(clientOrdersProvider).value;
  if (orders == null) return false;
  return orders.any((o) => o.status == OrderStatus.newOrder);
});
