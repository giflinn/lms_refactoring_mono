import 'package:app_settings/app_settings.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/push_preference.dart';
import '../../../../core/widgets/action_dialog.dart';
import '../../../../core/widgets/gradient_background.dart';
// Cross-feature import: settings owns the push on/off UI, chat owns the FCM
// token plumbing. Single direction (cabinet → chat), no cycle. And the auth
// controller for the "Удалить аккаунт" action.
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../../chat/data/push_service.dart';

/// "Настройки" — client-side app preferences. The notifications row is wired
/// (toggles registering/deleting the FCM token via [pushPreferenceProvider] +
/// [pushServiceProvider]). "Про нас" / "Обратная связь" / "Конфиденциальность"
/// route to their respective pages; "Поделиться" opens the system share sheet
/// with both store links; "Оценить приложение" tries the native in-app review
/// overlay and falls back to opening the store page. The "Язык" row from the
/// Figma is intentionally omitted — Russian-only per `mobile/CLAUDE.md`.
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
                      onTap: () => _onSharePressed(context),
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
                      onTap: () => _onRatePressed(),
                    ),
                    const SizedBox(height: 16),
                    _DrillItem(
                      iconAsset: 'assets/icons/settings/shield.svg',
                      label: 'Конфиденциальность',
                      onTap: () => context.push('/legal/privacy'),
                    ),
                    const SizedBox(height: 24),
                    _DeleteAccountItem(
                      onTap: () => _onDeleteAccountPressed(context, ref),
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

  // Share text + both store URLs. App Store URL works after the iOS app goes
  // public (the App ID is allocated when the App Store Connect entry is
  // created); until then, tapping the link from iOS shows an "Item Not
  // Available" page — acceptable as a temporary state. Android side is live.
  static const _shareText =
      'Приложение Жанны Слямовой — курсы, расписание занятий и поддержка коуча.\n\n'
      'Google Play: https://play.google.com/store/apps/details?id=kz.zhannaslyamova.lms\n'
      'App Store: https://apps.apple.com/app/id6773443347';

  static Future<void> _onSharePressed(BuildContext context) async {
    // iPad requires a source rect for the share popover; phones ignore it.
    // Anchor to the tapped row's render box.
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        text: _shareText,
        sharePositionOrigin: box != null
            ? box.localToGlobal(Offset.zero) & box.size
            : null,
      ),
    );
  }

  // Native in-app review on iOS (SKStoreReviewController) and Android (Play
  // Core). `isAvailable()` is true on iOS 10.3+ / supported Play installs;
  // when the overlay can't show (sideloaded debug, TestFlight, pre-launch
  // App Store), `requestReview()` silently no-ops — Apple/Google's design.
  // openStoreListing is the manual fallback when the API itself is missing.
  static Future<void> _onRatePressed() async {
    final review = InAppReview.instance;
    if (await review.isAvailable()) {
      await review.requestReview();
    } else {
      await review.openStoreListing(appStoreId: '6773443347');
    }
  }

  static Future<void> _onDeleteAccountPressed(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => ActionDialog(
        icon: const Icon(
          Icons.delete_outline,
          size: 50,
          color: AppColors.white,
        ),
        title: 'Удалить аккаунт?',
        subtitle:
            'Имя, телефон и аватар будут удалены. История заказов и отзывов сохранится анонимно. Вы сможете восстановить доступ позже, войдя тем же email.',
        primaryLabel: 'Удалить',
        secondaryLabel: 'Отмена',
        secondaryLabelColor: AppColors.purpleTertiary,
        onPrimary: () => Navigator.of(ctx).pop(true),
        onSecondary: () => Navigator.of(ctx).pop(false),
      ),
    );
    if (confirmed != true) return;
    if (!context.mounted) return;
    try {
      await ref.read(authProvider.notifier).deleteAccount();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось удалить аккаунт')),
      );
    }
    // No manual navigation — deleteAccount → signOut clears authProvider, the
    // router redirect carries the user to /login.
  }
}

class _DeleteAccountItem extends StatelessWidget {
  final VoidCallback onTap;

  const _DeleteAccountItem({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.redError.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              Icon(
                Icons.delete_outline,
                size: 24,
                color: AppColors.redError,
              ),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Удалить аккаунт',
                  style: TextStyle(
                    color: AppColors.redError,
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: AppColors.redError,
                size: 22,
              ),
            ],
          ),
        ),
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
