import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/action_dialog.dart';
import '../../../../core/widgets/brand_logotype.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../../notifications/presentation/controller/notifications_controllers.dart';
import '../../../orders/presentation/controller/client_orders_controller.dart';

/// "Кабинет" tab — client profile hub. Header (logotype + large title) +
/// account card (avatar, name, optional VIP chip, "Личные данные" link) +
/// 4 settings rows + logout.
///
/// Sub-pages (Личные данные, Уведомления, Мои покупки, Мои отзывы, Настройки)
/// are not built yet; their taps surface a "В разработке" snackbar.
class CabinetPage extends ConsumerWidget {
  const CabinetPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Safe: ClientShellPage is only mounted when authProvider has data.
    final user = ref.watch(authProvider).requireValue!;
    final hasUnreadNotifications =
        (ref.watch(notificationsUnreadCountProvider).value ?? 0) > 0;
    final hasNewOrders = ref.watch(hasNewOrdersProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Header(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              await Future.wait([
                ref.read(authProvider.notifier).refresh(),
                ref
                    .read(notificationsUnreadCountProvider.notifier)
                    .refresh(),
                ref.read(clientOrdersProvider.notifier).refresh(),
              ]);
            },
            color: AppColors.purplePrimary,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
              _AccountCard(
                firstName: user.firstName,
                lastName: user.lastName,
                avatarUrl: user.avatarUrl,
                isVip: user.clientCategory == 'vip',
                onTap: () => context.push('/client/personal-data'),
              ),
              const SizedBox(height: 16),
              _SettingsRow(
                iconAsset: 'assets/icons/cabinet/notifications.svg',
                label: 'Уведомления',
                hasBadge: hasUnreadNotifications,
                onTap: () => context.push('/client/notifications'),
              ),
              const SizedBox(height: 16),
              _SettingsRow(
                iconAsset: 'assets/icons/cabinet/purchases.svg',
                label: 'Мои покупки',
                hasBadge: hasNewOrders,
                onTap: () => context.push('/client/purchases'),
              ),
              const SizedBox(height: 16),
              _SettingsRow(
                iconAsset: 'assets/icons/cabinet/reviews.svg',
                label: 'Мои отзывы',
                onTap: () => context.push('/client/reviews'),
              ),
              const SizedBox(height: 16),
              _SettingsRow(
                iconAsset: 'assets/icons/cabinet/setting.png',
                label: 'Настройки',
                onTap: () => context.push('/client/settings'),
              ),
              const SizedBox(height: 16),
              _SettingsRow(
                iconAsset: 'assets/icons/cabinet/logout.svg',
                label: 'Выйти',
                onTap: () => _confirmAndSignOut(context, ref),
              ),
            ],
            ),
          ),
        ),
      ],
    );
  }


  static Future<void> _confirmAndSignOut(
    BuildContext context,
    WidgetRef ref,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => ActionDialog(
        icon: SvgPicture.asset(
          'assets/icons/cabinet/logout.svg',
          width: 50,
          height: 50,
          colorFilter: const ColorFilter.mode(
            AppColors.white,
            BlendMode.srcIn,
          ),
        ),
        title: 'Вы уверены что хотите выйти?',
        primaryLabel: 'Подтвердить',
        secondaryLabel: 'Отмена',
        secondaryLabelColor: AppColors.purpleTertiary,
        onPrimary: () => Navigator.of(ctx).pop(true),
        onSecondary: () => Navigator.of(ctx).pop(false),
      ),
    );
    if (confirmed == true) {
      await ref.read(authProvider.notifier).signOut();
    }
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: BrandLogotype(height: 26),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Text(
              'Кабинет',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 28,
                fontWeight: FontWeight.w500,
                height: 1.2,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountCard extends StatelessWidget {
  final String firstName;
  final String lastName;
  final String? avatarUrl;
  final bool isVip;
  final VoidCallback onTap;

  const _AccountCard({
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.isVip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
          child: Row(
            children: [
              UserAvatar(
                avatarUrl: avatarUrl,
                firstName: firstName,
                lastName: lastName,
                size: 60,
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 8, 16, 9),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              firstName.isEmpty ? 'Профиль' : firstName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w500,
                                height: 1.3,
                              ),
                            ),
                          ),
                          if (isVip) ...[
                            const SizedBox(width: 8),
                            const _VipChip(),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Личные данные',
                        style: TextStyle(
                          color: AppColors.purpleTertiary,
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Icon(
                Icons.chevron_right,
                color: AppColors.purpleTertiary,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VipChip extends StatelessWidget {
  const _VipChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.yellowGradientTop, AppColors.yellowGradientBottom],
        ),
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Text(
        'VIP',
        style: TextStyle(
          color: AppColors.white,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          height: 16 / 13,
        ),
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  final String iconAsset;
  final String label;
  final bool hasBadge;
  final VoidCallback onTap;

  const _SettingsRow({
    required this.iconAsset,
    required this.label,
    required this.onTap,
    this.hasBadge = false,
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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(
            children: [
              SizedBox(
                width: 24,
                height: 24,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    // PNG icons (Figma-exported @2x rasters) get tinted via
                    // Image.color; SVG icons go through SvgPicture's
                    // colorFilter. Same visual result.
                    iconAsset.endsWith('.svg')
                        ? SvgPicture.asset(
                            iconAsset,
                            width: 24,
                            height: 24,
                            colorFilter: const ColorFilter.mode(
                              AppColors.white,
                              BlendMode.srcIn,
                            ),
                          )
                        : Image.asset(
                            iconAsset,
                            width: 24,
                            height: 24,
                            color: AppColors.white,
                            colorBlendMode: BlendMode.srcIn,
                          ),
                    if (hasBadge)
                      const Positioned(
                        top: -1,
                        right: -1,
                        child: _BadgeDot(),
                      ),
                  ],
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
            ],
          ),
        ),
      ),
    );
  }
}

/// Same yellow dot as the bottom-nav unread indicator
/// (`role_bottom_nav.dart:_Badge`). Reuse the visual to keep unread language
/// consistent across the app.
class _BadgeDot extends StatelessWidget {
  const _BadgeDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7.5,
      height: 7.5,
      decoration: const BoxDecoration(
        color: AppColors.yellowPrimary,
        shape: BoxShape.circle,
      ),
    );
  }
}
