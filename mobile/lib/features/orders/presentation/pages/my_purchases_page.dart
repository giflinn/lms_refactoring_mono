import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../home/presentation/controller/client_shell_tab_controller.dart';
import '../../domain/order.dart';
import '../controller/client_orders_controller.dart';
import '../widgets/cancel_order_dialog.dart';
import '../widgets/order_card.dart';

/// Кабинет → "Мои покупки". Four tabs over the same list, filtered by
/// fulfillment status. Empty per-tab state is the cart icon + a "Перейти в
/// каталог" CTA. Per-card actions vary by status (chat handoff for new
/// orders, view + cancel for active orders).
class MyPurchasesPage extends ConsumerStatefulWidget {
  const MyPurchasesPage({super.key});

  @override
  ConsumerState<MyPurchasesPage> createState() => _MyPurchasesPageState();
}

class _MyPurchasesPageState extends ConsumerState<MyPurchasesPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
    _tab.addListener(() {
      // Rebuild so the badge dot beside "Новые" can react to the active tab
      // changing (the dot color is the same yellow regardless, but the rest
      // of the AppBar / tab styles want a refresh on switch).
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(clientOrdersProvider);
    final hasNew = ref.watch(hasNewOrdersProvider);

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              const _NavBar(),
              _Tabs(controller: _tab, hasNewBadge: hasNew),
              Expanded(
                child: ordersAsync.when(
                  loading: () => const _LoadingView(),
                  error: (_, _) => const _ErrorView(),
                  data: (orders) => TabBarView(
                    controller: _tab,
                    children: [
                      _OrdersTab(
                        status: OrderStatus.newOrder,
                        orders: orders
                            .where((o) => o.status == OrderStatus.newOrder)
                            .toList(),
                      ),
                      _OrdersTab(
                        status: OrderStatus.active,
                        orders: orders
                            .where((o) => o.status == OrderStatus.active)
                            .toList(),
                      ),
                      _OrdersTab(
                        status: OrderStatus.completed,
                        orders: orders
                            .where((o) => o.status == OrderStatus.completed)
                            .toList(),
                      ),
                      _OrdersTab(
                        status: OrderStatus.cancelled,
                        orders: orders
                            .where((o) => o.status == OrderStatus.cancelled)
                            .toList(),
                      ),
                    ],
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
              'Мои покупки',
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

class _Tabs extends StatelessWidget {
  final TabController controller;
  final bool hasNewBadge;

  const _Tabs({required this.controller, required this.hasNewBadge});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: AppColors.white.withValues(alpha: 0.1),
            width: 1,
          ),
        ),
      ),
      child: TabBar(
        controller: controller,
        isScrollable: true,
        tabAlignment: TabAlignment.start,
        padding: const EdgeInsets.only(left: 16),
        labelColor: AppColors.yellowPrimary,
        unselectedLabelColor: AppColors.purpleTertiary,
        indicatorColor: AppColors.yellowPrimary,
        indicatorWeight: 2,
        indicatorSize: TabBarIndicatorSize.tab,
        labelStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          letterSpacing: -0.4,
          height: 1.34,
        ),
        unselectedLabelStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          letterSpacing: -0.4,
          height: 1.34,
        ),
        dividerColor: Colors.transparent,
        tabs: [
          _TabLabel(label: 'Новые', showBadge: hasNewBadge),
          const _TabLabel(label: 'Активные'),
          const _TabLabel(label: 'Завершенные'),
          const _TabLabel(label: 'Отмененные'),
        ],
      ),
    );
  }
}

class _TabLabel extends StatelessWidget {
  final String label;
  final bool showBadge;

  const _TabLabel({required this.label, this.showBadge = false});

  @override
  Widget build(BuildContext context) {
    return Tab(
      height: 48,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label),
          if (showBadge) ...[
            const SizedBox(width: 4),
            Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: AppColors.yellowPrimary,
                shape: BoxShape.circle,
              ),
            ),
          ],
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
              'Не удалось загрузить покупки',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.7),
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () =>
                  ref.read(clientOrdersProvider.notifier).refresh(),
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

class _OrdersTab extends ConsumerWidget {
  final OrderStatus status;
  final List<ClientOrder> orders;

  const _OrdersTab({required this.status, required this.orders});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (orders.isEmpty) {
      return _EmptyTab(status: status);
    }
    final showSnackbar = status == OrderStatus.newOrder;
    return RefreshIndicator(
      color: AppColors.purplePrimary,
      onRefresh: () => ref.read(clientOrdersProvider.notifier).refresh(),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          if (showSnackbar) ...[
            const _ActivationSnackbar(),
            const SizedBox(height: 12),
          ],
          for (final o in orders) ...[
            OrderCard(
              order: o,
              actions: _actionsFor(context, status, o),
            ),
            const SizedBox(height: 16),
          ],
        ],
      ),
    );
  }

  Widget? _actionsFor(
    BuildContext context,
    OrderStatus status,
    ClientOrder order,
  ) {
    switch (status) {
      case OrderStatus.newOrder:
        return _NewOrderActions(order: order);
      case OrderStatus.active:
        return _ActiveOrderActions(order: order);
      case OrderStatus.completed:
      case OrderStatus.cancelled:
        return null;
    }
  }
}

class _EmptyTab extends ConsumerWidget {
  final OrderStatus status;

  const _EmptyTab({required this.status});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final message = switch (status) {
      OrderStatus.newOrder => 'Здесь появятся товары которые вы приобрели',
      OrderStatus.active => 'Здесь будут активные заказы',
      OrderStatus.completed => 'Здесь будут завершенные заказы',
      OrderStatus.cancelled => 'Здесь будут отмененные заказы',
    };
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(30, 0, 30, 24),
      children: [
        const SizedBox(height: 80),
        Center(
          child: SvgPicture.asset(
            'assets/icons/cart/cart.svg',
            width: 100,
            height: 100,
            colorFilter: ColorFilter.mode(
              AppColors.white.withValues(alpha: 0.7),
              BlendMode.srcIn,
            ),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 17,
            fontWeight: FontWeight.w500,
            height: 1.3,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 24),
        Center(
          child: _LargeYellowButton(
            label: 'Перейти в каталог',
            onTap: () {
              // Switch the shell to "Главная" first, then pop this page so
              // the user lands on the catalog instead of the cabinet tab
              // they pushed from.
              ref.read(clientShellTabProvider.notifier).goTo(0);
              Navigator.of(context).pop();
            },
          ),
        ),
      ],
    );
  }
}

/// Yellow info banner shown above the orders list on the "Новые" tab.
class _ActivationSnackbar extends StatelessWidget {
  const _ActivationSnackbar();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 8, 12, 8),
      decoration: BoxDecoration(
        color: const Color(0xFFFFCC00).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.info_outline,
            color: AppColors.yellowPrimary,
            size: 22,
          ),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Для активации заказа перейдите в чат с менеджером',
              style: TextStyle(
                color: AppColors.yellowPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                height: 1.4,
                letterSpacing: -0.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NewOrderActions extends StatelessWidget {
  final ClientOrder order;

  const _NewOrderActions({required this.order});

  @override
  Widget build(BuildContext context) {
    return _LargeYellowButton(
      label: 'Перейти в чат с менеджером',
      onTap: () {
        // Hand off to the chat tab with a pre-filled draft so the manager
        // sees which order the client is asking about. The chat input reads
        // `extra` on first build.
        context.push(
          '/client/chat',
          extra: ChatPrefill(text: 'По поводу заказа: №${order.orderNumber}'),
        );
      },
    );
  }
}

class _ActiveOrderActions extends StatelessWidget {
  final ClientOrder order;

  const _ActiveOrderActions({required this.order});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _OutlineButton(
          label: 'Просмотреть',
          onTap: () {
            // Stub — detail page is not built yet.
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('В разработке'),
                duration: Duration(seconds: 1),
              ),
            );
          },
        ),
        const SizedBox(height: 8),
        _TextOnlyButton(
          label: 'Отменить заказ',
          onTap: () async {
            final confirmed = await showCancelOrderDialog(context);
            if (!confirmed) return;
            if (!context.mounted) return;
            // Confirm is a stub for now — the backend cancel endpoint is
            // wired separately. Show feedback so the user sees the action
            // landed.
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('В разработке'),
                duration: Duration(seconds: 1),
              ),
            );
          },
        ),
      ],
    );
  }
}

/// Pill button (54×14r) with the yellow gradient — same shape as cart's
/// "Перейти в каталог" / "Перейти к оплате". Kept local to avoid promoting
/// it to core/widgets prematurely.
class _LargeYellowButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _LargeYellowButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          height: 54,
          width: double.infinity,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.yellowGradientTop,
                AppColors.yellowGradientBottom,
              ],
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(
            label,
            style: const TextStyle(
              color: AppColors.purpleDark,
              fontSize: 15,
              fontWeight: FontWeight.w500,
              height: 1.34,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ),
    );
  }
}

class _OutlineButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _OutlineButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(
              color: AppColors.white.withValues(alpha: 0.2),
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            label,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 15,
              fontWeight: FontWeight.w500,
              height: 1.34,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ),
    );
  }
}

class _TextOnlyButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _TextOnlyButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: TextButton(
        onPressed: onTap,
        child: Text(
          label,
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.34,
            letterSpacing: -0.4,
          ),
        ),
      ),
    );
  }
}

/// Carries a draft body across navigation to /client/chat. The chat page
/// reads it via go_router's `state.extra` on first build and seeds the
/// MessageInput.
class ChatPrefill {
  final String text;
  const ChatPrefill({required this.text});
}
