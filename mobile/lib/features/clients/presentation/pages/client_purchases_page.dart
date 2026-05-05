import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../orders/domain/order.dart';
import '../../../orders/presentation/widgets/order_card.dart';
import '../controller/client_purchases_controller.dart';

/// Staff "История покупок <клиент>" — read-only counterpart of the client
/// "Мои покупки" screen. Same four tabs, same `OrderCard` (`actions` slot
/// left null so no per-card buttons render). The Figma "Новые заказы"
/// section that lived on the client profile is folded into the "Новые" tab
/// here, per the user's "просто история покупок и там уже как в клиентской
/// версии" call.
class ClientPurchasesPage extends ConsumerStatefulWidget {
  final String clientId;
  const ClientPurchasesPage({super.key, required this.clientId});

  @override
  ConsumerState<ClientPurchasesPage> createState() =>
      _ClientPurchasesPageState();
}

class _ClientPurchasesPageState extends ConsumerState<ClientPurchasesPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 4, vsync: this);
    _tab.addListener(() {
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
    final asyncOrders =
        ref.watch(clientPurchasesProvider(widget.clientId));

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: Column(
            children: [
              const _NavBar(),
              _Tabs(controller: _tab),
              Expanded(
                child: asyncOrders.when(
                  loading: () => const Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.white,
                    ),
                  ),
                  error: (_, _) => _ErrorView(clientId: widget.clientId),
                  data: (orders) => TabBarView(
                    controller: _tab,
                    children: [
                      _OrdersTab(
                        clientId: widget.clientId,
                        status: OrderStatus.newOrder,
                        orders: orders
                            .where((o) => o.status == OrderStatus.newOrder)
                            .toList(),
                      ),
                      _OrdersTab(
                        clientId: widget.clientId,
                        status: OrderStatus.active,
                        orders: orders
                            .where((o) => o.status == OrderStatus.active)
                            .toList(),
                      ),
                      _OrdersTab(
                        clientId: widget.clientId,
                        status: OrderStatus.completed,
                        orders: orders
                            .where((o) => o.status == OrderStatus.completed)
                            .toList(),
                      ),
                      _OrdersTab(
                        clientId: widget.clientId,
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
              'История покупок',
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
  const _Tabs({required this.controller});

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
        tabs: const [
          Tab(height: 48, text: 'Новые'),
          Tab(height: 48, text: 'Активные'),
          Tab(height: 48, text: 'Завершенные'),
          Tab(height: 48, text: 'Отмененные'),
        ],
      ),
    );
  }
}

class _OrdersTab extends ConsumerWidget {
  final String clientId;
  final OrderStatus status;
  final List<ClientOrder> orders;

  const _OrdersTab({
    required this.clientId,
    required this.status,
    required this.orders,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (orders.isEmpty) {
      return _EmptyTab(status: status);
    }
    return RefreshIndicator(
      color: AppColors.purplePrimary,
      onRefresh: () =>
          ref.refresh(clientPurchasesProvider(clientId).future),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        itemCount: orders.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, i) => OrderCard(order: orders[i]),
      ),
    );
  }
}

class _EmptyTab extends StatelessWidget {
  final OrderStatus status;
  const _EmptyTab({required this.status});

  @override
  Widget build(BuildContext context) {
    final label = switch (status) {
      OrderStatus.newOrder => 'Новых заказов нет',
      OrderStatus.active => 'Активных заказов нет',
      OrderStatus.completed => 'Завершённых заказов нет',
      OrderStatus.cancelled => 'Отменённых заказов нет',
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.white.withValues(alpha: 0.6),
            fontSize: 15,
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends ConsumerWidget {
  final String clientId;
  const _ErrorView({required this.clientId});

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
                  ref.refresh(clientPurchasesProvider(clientId).future),
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
