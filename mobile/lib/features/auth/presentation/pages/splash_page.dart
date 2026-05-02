import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/app_logo.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../../core/widgets/secondary_button.dart';
import '../controller/auth_controller.dart';

final appVersionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return info.version;
});

class SplashPage extends ConsumerStatefulWidget {
  const SplashPage({super.key});

  @override
  ConsumerState<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends ConsumerState<SplashPage> {
  // Delay the "Соединение с сервером…" subtext so it doesn't flash for
  // sub-second auth resolutions on the happy path.
  static const _subtextDelay = Duration(milliseconds: 1200);

  bool _showSubtext = false;
  Timer? _subtextTimer;

  @override
  void initState() {
    super.initState();
    _subtextTimer = Timer(_subtextDelay, () {
      if (mounted) setState(() => _showSubtext = true);
    });
  }

  @override
  void dispose() {
    _subtextTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final version = ref.watch(appVersionProvider).value;

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Stack(
            children: [
              const Center(child: AppLogo(width: 250)),
              if (auth.hasError)
                Align(
                  alignment: const Alignment(0, 0.55),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Не удалось подключиться к серверу.\nПроверьте интернет.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: AppColors.white.withValues(alpha: 0.85),
                            fontSize: 14,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 20),
                        PrimaryButton(
                          label: 'Повторить',
                          onPressed: () => ref.invalidate(authProvider),
                        ),
                        const SizedBox(height: 10),
                        SecondaryButton(
                          label: 'Войти заново',
                          onPressed: () => context.go('/login'),
                        ),
                      ],
                    ),
                  ),
                ),
              Positioned(
                bottom: 24,
                left: 0,
                right: 0,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (version != null)
                      Text(
                        'Версия $version',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppColors.white.withValues(alpha: 0.6),
                          fontSize: 11,
                        ),
                      ),
                    if (!auth.hasError && _showSubtext) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Соединение с сервером…',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: AppColors.white.withValues(alpha: 0.7),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
