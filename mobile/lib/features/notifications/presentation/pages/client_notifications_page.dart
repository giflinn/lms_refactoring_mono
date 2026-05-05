import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../domain/notification_item.dart';
import '../controller/notifications_controllers.dart';
import '../widgets/notification_card.dart';

/// Client inbox — Кабинет → Уведомления. List of delivered notifications,
/// or an empty-state bell illustration. On open we mark everything read so
/// the cabinet badge clears.
class ClientNotificationsPage extends ConsumerStatefulWidget {
  const ClientNotificationsPage({super.key});

  @override
  ConsumerState<ClientNotificationsPage> createState() =>
      _ClientNotificationsPageState();
}

class _ClientNotificationsPageState
    extends ConsumerState<ClientNotificationsPage> {
  @override
  void initState() {
    super.initState();
    // Defer until after the first frame so the controllers are set up before
    // we kick off the side-effect.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      markAllNotificationsRead(ref);
    });
  }

  @override
  Widget build(BuildContext context) {
    final inbox = ref.watch(notificationsInboxProvider);

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              const _NavBar(),
              Expanded(
                child: inbox.when(
                  loading: () => const _LoadingView(),
                  error: (_, _) => const _ErrorView(),
                  data: (items) => items.isEmpty
                      ? const _EmptyView()
                      : _InboxList(items: items),
                ),
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
              'Уведомления',
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

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(
        strokeWidth: 2,
        color: AppColors.white,
      ),
    );
  }
}

class _ErrorView extends ConsumerWidget {
  const _ErrorView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Не удалось загрузить уведомления',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.7),
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () =>
                  ref.read(notificationsInboxProvider.notifier).refresh(),
              child: const Text(
                'Повторить',
                style: TextStyle(
                  color: AppColors.yellowPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.asset(
            'assets/icons/cabinet/notifications.svg',
            width: 80,
            height: 80,
            colorFilter: ColorFilter.mode(
              AppColors.white.withValues(alpha: 0.6),
              BlendMode.srcIn,
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'У вас еще нет уведомлений.',
            style: TextStyle(
              color: AppColors.white,
              fontSize: 17,
              height: 1.3,
              letterSpacing: -0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _InboxList extends ConsumerWidget {
  final List<NotificationItem> items;
  const _InboxList({required this.items});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Chat-style layout: backend returns DESC (newest first); with
    // `reverse: true` the ListView anchors at pixel 0 = bottom of viewport,
    // and itemBuilder index 0 maps to that bottom row. Feeding items[0]
    // (newest) at index 0 puts the newest card at the bottom on entry — no
    // explicit jumpTo needed, no animation. Scrolling up reveals older.
    return RefreshIndicator(
      color: AppColors.purplePrimary,
      onRefresh: () =>
          ref.read(notificationsInboxProvider.notifier).refresh(),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        reverse: true,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 16),
        itemBuilder: (_, i) => NotificationCard(item: items[i]),
      ),
    );
  }
}
