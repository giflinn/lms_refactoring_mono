import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/clients_api_provider.dart';
import '../../domain/client.dart';
import 'clients_list_controller.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

/// Selector for the cached row backing the detail page. The list provider
/// is the single source of truth; this narrows it to one row so the detail
/// page can `ref.watch` and rebuild on edits.
final clientByIdProvider = Provider.family<Client?, String>((ref, clientId) {
  final list = ref.watch(clientsListProvider).clients;
  final match = list.where((c) => c.id == clientId);
  return match.isEmpty ? null : match.first;
});

/// Patch a client's comment server-side and mirror the result into the list.
/// Throws ClientUpdateException / NetworkException on failure. Takes a
/// WidgetRef so pages call it directly with their `ref`.
Future<void> updateClientComment({
  required WidgetRef ref,
  required String clientId,
  required String comment,
}) async {
  final token = await _idToken();
  final updated = await ref.read(clientsApiProvider).update(
        idToken: token,
        clientId: clientId,
        comment: comment,
      );
  ref.read(clientsListProvider.notifier).replaceClient(updated);
}
