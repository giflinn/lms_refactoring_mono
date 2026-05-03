import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/domain/app_user.dart';
import 'core/router/app_router.dart';
import 'features/auth/presentation/controller/auth_controller.dart';
import 'features/chat/data/push_service.dart';

class App extends ConsumerStatefulWidget {
  const App({super.key});

  @override
  ConsumerState<App> createState() => _AppState();
}

class _AppState extends ConsumerState<App> {
  @override
  void initState() {
    super.initState();
    // Wire push registration to the auth lifecycle. Done here (not inside
    // AuthController) so the auth feature stays free of cross-feature data
    // imports — App is the right place to compose feature side-effects.
    ref.listenManual<AsyncValue<AppUser?>>(authProvider, (prev, next) {
      final wasUser = prev?.value;
      final isUser = next.value;
      final push = ref.read(pushServiceProvider);
      if (isUser != null && wasUser?.id != isUser.id) {
        // Logged in (or switched users).
        push.registerForCurrentUser();
      } else if (wasUser != null && isUser == null) {
        // Logged out.
        push.unregisterCurrentDevice();
      }
    }, fireImmediately: true);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Slyamova Zhanna',
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
