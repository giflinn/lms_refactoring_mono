import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/domain/role.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../domain/staff_order.dart';
import '../controller/staff_orders_controller.dart';
import '../widgets/staff_order_card.dart';

const _tabsOrder = <FulfillmentStatus>[
  FulfillmentStatus.newOrder,
  FulfillmentStatus.active,
  FulfillmentStatus.completed,
  FulfillmentStatus.cancelled,
];

const _tabLabels = <FulfillmentStatus, String>{
  FulfillmentStatus.newOrder: 'Новые',
  FulfillmentStatus.active: 'Активные',
  FulfillmentStatus.completed: 'Завершенные',
  FulfillmentStatus.cancelled: 'Отмененные',
};

/// Staff bottom-nav tab "Заказы". Composed inside [StaffShellPage]; the
/// shell owns the topbar (avatar + brand) so this page only renders the
/// search field, tabs, and the per-tab list.
class StaffOrdersListPage extends ConsumerStatefulWidget {
  const StaffOrdersListPage({super.key});

  @override
  ConsumerState<StaffOrdersListPage> createState() =>
      _StaffOrdersListPageState();
}

class _StaffOrdersListPageState extends ConsumerState<StaffOrdersListPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: _tabsOrder.length, vsync: this);
    _tab.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    // Push the same query into every tab's controller so flipping tabs
    // doesn't reset the search the user just typed.
    for (final tab in _tabsOrder) {
      ref.read(staffOrdersListProvider(tab).notifier).setQuery(value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value;
    final isPlainManager = user?.role == Role.manager;
    final hasNew = ref.watch(hasNewStaffOrdersProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: _SearchField(
            controller: _searchCtrl,
            onChanged: _onSearchChanged,
            onClear: () {
              _searchCtrl.clear();
              _onSearchChanged('');
            },
          ),
        ),
        _Tabs(controller: _tab, hasNewBadge: hasNew),
        Expanded(
          child: TabBarView(
            controller: _tab,
            children: [
              for (final tab in _tabsOrder)
                _OrdersTabView(
                  tab: tab,
                  showManagerRow: !isPlainManager,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  const _SearchField({
    required this.controller,
    required this.onChanged,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      style: const TextStyle(color: AppColors.white, fontSize: 15),
      cursorColor: AppColors.white,
      decoration: InputDecoration(
        hintText: 'Поиск по № или клиенту',
        hintStyle: TextStyle(color: AppColors.white.withValues(alpha: 0.5)),
        filled: true,
        fillColor: AppColors.white.withValues(alpha: 0.1),
        prefixIcon: Icon(
          Icons.search,
          color: AppColors.white.withValues(alpha: 0.6),
          size: 20,
        ),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(
                icon: Icon(
                  Icons.close,
                  color: AppColors.white.withValues(alpha: 0.6),
                  size: 18,
                ),
                onPressed: onClear,
              ),
        contentPadding: const EdgeInsets.symmetric(vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide.none,
        ),
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
          for (final tab in _tabsOrder)
            _TabLabel(
              label: _tabLabels[tab]!,
              showBadge: tab == FulfillmentStatus.newOrder && hasNewBadge,
            ),
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

class _OrdersTabView extends ConsumerStatefulWidget {
  final FulfillmentStatus tab;
  final bool showManagerRow;

  const _OrdersTabView({
    required this.tab,
    required this.showManagerRow,
  });

  @override
  ConsumerState<_OrdersTabView> createState() => _OrdersTabViewState();
}

class _OrdersTabViewState extends ConsumerState<_OrdersTabView>
    with AutomaticKeepAliveClientMixin {
  final _scroll = ScrollController();

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    // Trigger the next page within 400px of the bottom — mirrors the
    // clients-list cadence so feed-style screens behave consistently.
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 400) {
      ref.read(staffOrdersListProvider(widget.tab).notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(staffOrdersListProvider(widget.tab));

    if (state.loadingFirst && state.orders.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.white),
      );
    }
    if (state.error != null && state.orders.isEmpty) {
      return _ErrorView(
        onRetry: () =>
            ref.read(staffOrdersListProvider(widget.tab).notifier).refresh(),
      );
    }
    if (state.orders.isEmpty) {
      return _EmptyView(
        tab: widget.tab,
        searching: state.query.trim().isNotEmpty,
      );
    }

    final groups = _groupByMonth(state.orders);

    return RefreshIndicator(
      color: AppColors.purplePrimary,
      onRefresh: () =>
          ref.read(staffOrdersListProvider(widget.tab).notifier).refresh(),
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: groups.length + (state.loadingMore ? 1 : 0),
        itemBuilder: (_, i) {
          if (i >= groups.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.white),
              ),
            );
          }
          final group = groups[i];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (i > 0) const SizedBox(height: 8),
              _MonthHeader(label: group.label),
              const SizedBox(height: 8),
              for (final order in group.orders) ...[
                StaffOrderCard(
                  order: order,
                  showManagerRow: widget.showManagerRow,
                  onTap: () => context.push('/staff/orders/${order.id}'),
                ),
                const SizedBox(height: 16),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _MonthGroup {
  final String label;
  final List<StaffOrder> orders;

  const _MonthGroup({required this.label, required this.orders});
}

List<_MonthGroup> _groupByMonth(List<StaffOrder> orders) {
  final out = <_MonthGroup>[];
  String? lastKey;
  for (final o in orders) {
    final local = o.createdAt.toLocal();
    final key = '${local.year}-${local.month}';
    if (key != lastKey) {
      out.add(_MonthGroup(
        label: formatYearMonthHeader(o.createdAt),
        orders: [o],
      ));
      lastKey = key;
    } else {
      out.last.orders.add(o);
    }
  }
  return out;
}

class _MonthHeader extends StatelessWidget {
  final String label;
  const _MonthHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: TextStyle(
        color: AppColors.white.withValues(alpha: 0.6),
        fontSize: 13,
        fontWeight: FontWeight.w500,
        height: 1.4,
        letterSpacing: -0.2,
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  final FulfillmentStatus tab;
  final bool searching;

  const _EmptyView({required this.tab, required this.searching});

  @override
  Widget build(BuildContext context) {
    final message = searching
        ? 'По вашему запросу ничего не найдено'
        : switch (tab) {
            FulfillmentStatus.newOrder =>
              'Здесь будет отображаться список с заказами клиентов',
            FulfillmentStatus.active => 'Активных заказов пока нет',
            FulfillmentStatus.completed => 'Завершенных заказов пока нет',
            FulfillmentStatus.cancelled => 'Отмененных заказов пока нет',
          };
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(30, 0, 30, 24),
      children: [
        const SizedBox(height: 80),
        Center(
          child: Icon(
            Icons.shopping_cart_outlined,
            size: 100,
            color: AppColors.white.withValues(alpha: 0.7),
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
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final Future<void> Function() onRetry;

  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Не удалось загрузить заказы',
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.8),
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: onRetry,
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
    );
  }
}
