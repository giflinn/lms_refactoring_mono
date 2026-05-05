import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/cancellation.dart';
import '../controller/staff_cancellations_controller.dart';
import '../widgets/cancellation_list_tile.dart';

const _tabsOrder = <CancellationStatus>[
  CancellationStatus.requested,
  CancellationStatus.approved,
  CancellationStatus.rejected,
];

const _tabLabels = <CancellationStatus, String>{
  CancellationStatus.requested: 'Запрошено',
  CancellationStatus.approved: 'Одобрено',
  CancellationStatus.rejected: 'Отказано',
};

/// Staff bottom-nav tab "Отмены". Composed inside [StaffShellPage]; the
/// shell owns the topbar, so this page only renders search, tabs, list.
class StaffCancellationsListPage extends ConsumerStatefulWidget {
  const StaffCancellationsListPage({super.key});

  @override
  ConsumerState<StaffCancellationsListPage> createState() =>
      _StaffCancellationsListPageState();
}

class _StaffCancellationsListPageState
    extends ConsumerState<StaffCancellationsListPage>
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
    for (final tab in _tabsOrder) {
      ref
          .read(staffCancellationsListProvider(tab).notifier)
          .setQuery(value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasPending = ref.watch(hasPendingCancellationsProvider);

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
        _Tabs(controller: _tab, hasPendingBadge: hasPending),
        Expanded(
          child: TabBarView(
            controller: _tab,
            children: [for (final tab in _tabsOrder) _TabView(tab: tab)],
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
  final bool hasPendingBadge;

  const _Tabs({required this.controller, required this.hasPendingBadge});

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
              showBadge:
                  tab == CancellationStatus.requested && hasPendingBadge,
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

class _TabView extends ConsumerStatefulWidget {
  final CancellationStatus tab;

  const _TabView({required this.tab});

  @override
  ConsumerState<_TabView> createState() => _TabViewState();
}

class _TabViewState extends ConsumerState<_TabView>
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
    if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 400) {
      ref
          .read(staffCancellationsListProvider(widget.tab).notifier)
          .loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(staffCancellationsListProvider(widget.tab));

    if (state.loadingFirst && state.rows.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.white),
      );
    }
    if (state.error != null && state.rows.isEmpty) {
      return _ErrorView(
        onRetry: () => ref
            .read(staffCancellationsListProvider(widget.tab).notifier)
            .refresh(),
      );
    }
    if (state.rows.isEmpty) {
      return _EmptyView(
        tab: widget.tab,
        searching: state.query.trim().isNotEmpty,
      );
    }

    final groups = _groupByDay(state.rows);

    return RefreshIndicator(
      color: AppColors.purplePrimary,
      onRefresh: () => ref
          .read(staffCancellationsListProvider(widget.tab).notifier)
          .refresh(),
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 8, bottom: 24),
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
              if (i > 0) const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 4),
                child: Text(
                  group.label,
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.6),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
              for (final row in group.rows)
                CancellationListTile(
                  row: row,
                  onTap: () =>
                      context.push('/staff/cancellations/${row.id}'),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _DayGroup {
  final String label;
  final List<StaffCancellation> rows;

  const _DayGroup({required this.label, required this.rows});
}

List<_DayGroup> _groupByDay(List<StaffCancellation> rows) {
  final out = <_DayGroup>[];
  String? lastKey;
  for (final r in rows) {
    final local = r.createdAt.toLocal();
    final key = '${local.year}-${local.month}-${local.day}';
    if (key != lastKey) {
      out.add(_DayGroup(
        label: formatDayMonthHeader(r.createdAt),
        rows: [r],
      ));
      lastKey = key;
    } else {
      out.last.rows.add(r);
    }
  }
  return out;
}

class _EmptyView extends StatelessWidget {
  final CancellationStatus tab;
  final bool searching;

  const _EmptyView({required this.tab, required this.searching});

  @override
  Widget build(BuildContext context) {
    final message = searching
        ? 'По вашему запросу ничего не найдено'
        : switch (tab) {
            CancellationStatus.requested =>
              'Здесь появятся товары от которых клиенты хотят отказаться',
            CancellationStatus.approved => 'Одобренных отмен пока нет',
            CancellationStatus.rejected => 'Отказанных отмен пока нет',
          };
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(40, 0, 40, 24),
      children: [
        const SizedBox(height: 80),
        Center(
          child: CustomPaint(
            size: const Size(80, 92),
            painter: _ReceiptCancelPainter(
              color: AppColors.white.withValues(alpha: 0.7),
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
      ],
    );
  }
}

/// "Receipt with X" empty-state icon from the Figma cancellations screen.
/// Drawn in code so we don't ship a one-off asset; matches the same linear
/// stroke style as `_CartCrossPainter` in the cancel-order dialog.
class _ReceiptCancelPainter extends CustomPainter {
  final Color color;

  const _ReceiptCancelPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final w = size.width;
    final h = size.height;

    // Top + sides of the receipt (rounded top corners, no bottom — replaced
    // with a zigzag tear).
    final body = Path()
      ..moveTo(w * 0.15, h * 0.78)
      ..lineTo(w * 0.15, h * 0.18)
      ..arcToPoint(
        Offset(w * 0.25, h * 0.08),
        radius: const Radius.circular(8),
      )
      ..lineTo(w * 0.75, h * 0.08)
      ..arcToPoint(
        Offset(w * 0.85, h * 0.18),
        radius: const Radius.circular(8),
      )
      ..lineTo(w * 0.85, h * 0.78);
    canvas.drawPath(body, stroke);

    // Zigzag bottom — the "torn paper" edge.
    const teeth = 6;
    final tearPath = Path()..moveTo(w * 0.15, h * 0.78);
    for (var i = 1; i <= teeth; i++) {
      final dx = w * 0.15 + (w * 0.7 / teeth) * i;
      final dy = i.isOdd ? h * 0.92 : h * 0.78;
      tearPath.lineTo(dx, dy);
    }
    canvas.drawPath(tearPath, stroke);

    // X centred inside the receipt.
    canvas.drawLine(Offset(w * 0.40, h * 0.32), Offset(w * 0.60, h * 0.52),
        stroke);
    canvas.drawLine(Offset(w * 0.60, h * 0.32), Offset(w * 0.40, h * 0.52),
        stroke);

    // Single small dot below the X — matches the Figma sketch.
    canvas.drawCircle(Offset(w * 0.50, h * 0.62), 1.5, stroke);
  }

  @override
  bool shouldRepaint(_ReceiptCancelPainter oldDelegate) =>
      oldDelegate.color != color;
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
            'Не удалось загрузить отмены',
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
