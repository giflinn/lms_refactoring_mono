import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/app_logo.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/primary_button.dart';
import '../../../../core/widgets/secondary_button.dart';
import '../controller/auth_controller.dart';

const _ruMonthsGenitive = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

String _formatRuDate(DateTime dt) =>
    '${dt.day} ${_ruMonthsGenitive[dt.month - 1]} ${dt.year}';

/// Landing page for clients whose account is in the soft-deleted state.
/// The auth_router redirect bounces them here whenever `selfDeletedAt != null`
/// so they cannot reach /home until they either restore or sign out.
class RestoreAccountPage extends ConsumerStatefulWidget {
  const RestoreAccountPage({super.key});

  @override
  ConsumerState<RestoreAccountPage> createState() => _RestoreAccountPageState();
}

class _RestoreAccountPageState extends ConsumerState<RestoreAccountPage> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value;
    final deletedAt = user?.selfDeletedAt;
    final deletedLabel =
        deletedAt == null ? null : _formatRuDate(deletedAt.toLocal());

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                const Spacer(),
                const AppLogo(),
                const SizedBox(height: 32),
                const Text(
                  'Аккаунт удалён',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  deletedLabel == null
                      ? 'Вы удалили аккаунт. Хотите восстановить доступ?'
                      : 'Вы удалили аккаунт $deletedLabel.\nХотите восстановить доступ?',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.8),
                    fontSize: 15,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 32),
                PrimaryButton(
                  label: 'Восстановить',
                  loading: _busy,
                  onPressed: _busy ? null : _restore,
                ),
                const SizedBox(height: 12),
                SecondaryButton(
                  label: 'Выйти',
                  onPressed: _busy ? null : _signOut,
                ),
                const Spacer(flex: 2),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _restore() async {
    setState(() => _busy = true);
    try {
      await ref.read(authProvider.notifier).restoreAccount();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось восстановить аккаунт')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signOut() async {
    setState(() => _busy = true);
    try {
      await ref.read(authProvider.notifier).signOut();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
