import 'package:app_settings/app_settings.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/push_preference.dart';
import '../../../../core/widgets/action_dialog.dart';
import '../../../../core/widgets/gradient_background.dart';
// Cross-feature import: settings owns the push on/off UI, chat owns the FCM
// token plumbing. Single direction (cabinet → chat), no cycle.
import '../../../chat/data/push_service.dart';

/// "Настройки" — client-side app preferences. The notifications row is wired
/// (toggles registering/deleting the FCM token via [pushPreferenceProvider] +
/// [pushServiceProvider]). All other rows surface "В разработке". The "Язык"
/// row from the Figma is intentionally omitted — Russian-only per
/// `mobile/CLAUDE.md`.
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pushEnabled = ref.watch(pushPreferenceProvider).value ?? true;

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              const _NavBar(),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    _ToggleItem(
                      iconAsset: 'assets/icons/settings/bell.svg',
                      label: 'Уведомления',
                      value: pushEnabled,
                      onChanged: (v) => _onPushToggled(context, ref, v),
                    ),
                    const SizedBox(height: 16),
                    _DrillItem(
                      iconAsset: 'assets/icons/settings/info.svg',
                      label: 'Про нас',
                      onTap: () => context.push('/legal/about'),
                    ),
                    const SizedBox(height: 16),
                    _DrillItem(
                      iconAsset: 'assets/icons/settings/share.svg',
                      label: 'Поделиться',
                      onTap: () => _stub(context),
                    ),
                    const SizedBox(height: 16),
                    _DrillItem(
                      iconAsset: 'assets/icons/settings/mail.svg',
                      label: 'Обратная связь',
                      onTap: () => context.push('/client/feedback'),
                    ),
                    const SizedBox(height: 16),
                    _DrillItem(
                      iconAsset: 'assets/icons/settings/star.svg',
                      label: 'Оценить приложение',
                      onTap: () => _stub(context),
                    ),
                    const SizedBox(height: 16),
                    _DrillItem(
                      iconAsset: 'assets/icons/settings/shield.svg',
                      label: 'Конфиденциальность',
                      onTap: () => context.push('/legal/privacy'),
                    ),
                  ],
                ),
              ),
              const _VersionFooter(),
            ],
          ),
        ),
      ),
    );
  }

  static Future<void> _onPushToggled(
    BuildContext context,
    WidgetRef ref,
    bool enabled,
  ) async {
    await ref.read(pushPreferenceProvider.notifier).set(enabled);
    final push = ref.read(pushServiceProvider);
    if (!enabled) {
      await push.unregisterCurrentDevice();
      return;
    }
    await push.registerForCurrentUser();
    if (!context.mounted) return;
    // OS-level permission can be denied independently (system Settings or a
    // prior "Don't Allow" tap on the first prompt). FirebaseMessaging won't
    // re-prompt once denied, so offer a deeplink to system Settings.
    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    if (!context.mounted) return;
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      await _promptOpenSystemSettings(context);
    }
  }

  static Future<void> _promptOpenSystemSettings(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => ActionDialog(
        icon: const Icon(
          Icons.notifications_off_outlined,
          size: 50,
          color: AppColors.white,
        ),
        title: 'Включите уведомления',
        subtitle:
            'Чтобы получать пуши, разрешите уведомления в системных настройках.',
        primaryLabel: 'Открыть настройки',
        secondaryLabel: 'Не сейчас',
        secondaryLabelColor: AppColors.purpleTertiary,
        onPrimary: () => Navigator.of(ctx).pop(true),
        onSecondary: () => Navigator.of(ctx).pop(false),
      ),
    );
    if (confirmed == true) {
      await AppSettings.openAppSettings(type: AppSettingsType.notification);
    }
  }

  static void _stub(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('В разработке'),
        duration: Duration(seconds: 1),
      ),
    );
  }
}

class _NavBar extends StatelessWidget {
  const _NavBar();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: Stack(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(
                Icons.arrow_back_ios,
                color: AppColors.white,
                size: 20,
              ),
              tooltip: 'Назад',
            ),
          ),
          const Center(
            child: Text(
              'Настройки',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RowShell extends StatelessWidget {
  final String iconAsset;
  final String label;
  final Widget trailing;
  final VoidCallback onTap;
  final EdgeInsets padding;

  const _RowShell({
    required this.iconAsset,
    required this.label,
    required this.trailing,
    required this.onTap,
    required this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: padding,
          child: Row(
            children: [
              SvgPicture.asset(
                iconAsset,
                width: 24,
                height: 24,
                colorFilter: const ColorFilter.mode(
                  AppColors.white,
                  BlendMode.srcIn,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
              ),
              trailing,
            ],
          ),
        ),
      ),
    );
  }
}

class _DrillItem extends StatelessWidget {
  final String iconAsset;
  final String label;
  final VoidCallback onTap;

  const _DrillItem({
    required this.iconAsset,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return _RowShell(
      iconAsset: iconAsset,
      label: label,
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      trailing: const Icon(
        Icons.chevron_right,
        color: AppColors.purpleTertiary,
        size: 22,
      ),
    );
  }
}

class _ToggleItem extends StatelessWidget {
  final String iconAsset;
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _ToggleItem({
    required this.iconAsset,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return _RowShell(
      iconAsset: iconAsset,
      label: label,
      onTap: () => onChanged(!value),
      // Tighter vertical padding so the row height matches drill-in rows even
      // though the Switch is taller than a chevron.
      padding: const EdgeInsets.fromLTRB(16, 4, 12, 4),
      trailing: Switch.adaptive(
        value: value,
        onChanged: onChanged,
        activeThumbColor: AppColors.white,
        activeTrackColor: AppColors.yellowPrimary,
      ),
    );
  }
}

class _VersionFooter extends StatelessWidget {
  const _VersionFooter();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PackageInfo>(
      future: PackageInfo.fromPlatform(),
      builder: (context, snapshot) {
        final v = snapshot.data?.version;
        return Padding(
          padding: const EdgeInsets.only(bottom: 16, top: 8),
          child: Text(
            v == null ? '' : 'Версия $v',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.6),
              fontSize: 11,
              fontWeight: FontWeight.w500,
              height: 1.1,
            ),
          ),
        );
      },
    );
  }
}
