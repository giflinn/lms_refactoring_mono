import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_api_provider.dart';

/// One-shot fetch of /auth/register-config. Controls whether the optional
/// «Код менеджера» field is rendered on the registration and complete-profile
/// screens. The admin toggles it from the web panel; hidden by default and
/// on fetch failure.
final showManagerCodeFieldProvider = FutureProvider<bool>((ref) async {
  final api = ref.watch(authApiProvider);
  return api.fetchShowManagerCodeField();
});
