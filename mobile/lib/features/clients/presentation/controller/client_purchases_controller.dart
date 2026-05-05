import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../orders/domain/order.dart';
import '../../data/clients_api_provider.dart';

/// Staff "История покупок" loader, scoped per client. Tabs filter on the
/// returned list client-side. Refresh by `ref.invalidate(...)`.
final clientPurchasesProvider =
    FutureProvider.family<List<ClientOrder>, String>((ref, clientId) async {
  final fbUser = fb.FirebaseAuth.instance.currentUser;
  if (fbUser == null) throw StateError('not_authenticated');
  final token = await fbUser.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return ref
      .read(clientsApiProvider)
      .listOrders(idToken: token, clientId: clientId);
});
