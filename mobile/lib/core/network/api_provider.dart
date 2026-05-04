import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/presentation/controller/auth_controller.dart';
import '../log.dart';
import 'api_client.dart';

/// Singleton [ApiClient] used by every feature's data layer.
/// Override in tests with `overrideWithValue(ApiClient(baseUrl: ..., client: mockHttp))`.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    baseUrl: ApiClient.resolveBaseUrl(),
    onSessionRevoked: () {
      // Backend rejected our token because the user was deleted or their
      // refresh tokens were revoked (password reset). Drop them out of the
      // app so the router redirect bounces them to /login. Fire-and-forget:
      // we're inside a response handler, and signOut tolerates being called
      // multiple times — duplicate fires are harmless.
      ref
          .read(authProvider.notifier)
          .signOut()
          .catchError(
            (e, st) => logd('onSessionRevoked: signOut failed', e, st),
          );
    },
  );
});
