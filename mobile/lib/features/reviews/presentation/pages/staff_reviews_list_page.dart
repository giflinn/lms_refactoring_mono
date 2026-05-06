import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/review.dart';
import '../controller/staff_reviews_controller.dart';
import '../widgets/staff_review_list_tile.dart';

const _tabsOrder = <ReviewStatus>[
  ReviewStatus.pending,
  ReviewStatus.published,
  ReviewStatus.deleted,
];

const _tabLabels = <ReviewStatus, String>{
  ReviewStatus.pending: 'На модерации',
  ReviewStatus.published: 'Опубликованные',
  ReviewStatus.deleted: 'Удалённые',
};

/// Staff bottom-nav tab "Отзывы". Three tabs by status, shared search field,
/// taps push to per-client feed.
class StaffReviewsListPage extends ConsumerStatefulWidget {
  const StaffReviewsListPage({super.key});

  @override
  ConsumerState<StaffReviewsListPage> createState() =>
      _StaffReviewsListPageState();
}

class _StaffReviewsListPageState extends ConsumerState<StaffReviewsListPage>
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
    for (final s in _tabsOrder) {
      ref.read(staffReviewsListProvider(s).notifier).setQuery(value);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasPending = ref.watch(hasPendingReviewsProvider);
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
            children: [for (final s in _tabsOrder) _TabView(status: s)],
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
        hintText: 'Поиск по клиенту или товару',
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
          for (final s in _tabsOrder)
            _TabLabel(
              label: _tabLabels[s]!,
              showBadge: s == ReviewStatus.pending && hasPendingBadge,
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
  final ReviewStatus status;
  const _TabView({required this.status});

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
      ref.read(staffReviewsListProvider(widget.status).notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(staffReviewsListProvider(widget.status));

    if (state.loadingFirst && state.reviews.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.white),
      );
    }
    if (state.error != null && state.reviews.isEmpty) {
      return _ErrorView(
        onRetry: () => ref
            .read(staffReviewsListProvider(widget.status).notifier)
            .refresh(),
      );
    }
    if (state.reviews.isEmpty) {
      return _EmptyView(
        status: widget.status,
        searching: state.query.trim().isNotEmpty,
      );
    }

    return RefreshIndicator(
      color: AppColors.purplePrimary,
      onRefresh: () => ref
          .read(staffReviewsListProvider(widget.status).notifier)
          .refresh(),
      child: ListView.separated(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 16),
        itemCount: state.reviews.length + (state.loadingMore ? 1 : 0),
        separatorBuilder: (_, _) => Divider(
          color: AppColors.white.withValues(alpha: 0.08),
          thickness: 0.5,
          height: 0.5,
        ),
        itemBuilder: (_, i) {
          if (i >= state.reviews.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    color: AppColors.white,
                    strokeWidth: 2,
                  ),
                ),
              ),
            );
          }
          final review = state.reviews[i];
          return StaffReviewListTile(
            review: review,
            onTap: () => context.push(
              '/staff/clients/${review.client.id}/reviews',
            ),
          );
        },
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  final ReviewStatus status;
  final bool searching;

  const _EmptyView({required this.status, required this.searching});

  @override
  Widget build(BuildContext context) {
    final msg = searching
        ? 'Ничего не найдено по запросу.'
        : switch (status) {
            ReviewStatus.pending => 'На модерации сейчас пусто.',
            ReviewStatus.published => 'Опубликованных отзывов пока нет.',
            ReviewStatus.deleted => 'Удалённых отзывов нет.',
          };
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Text(
          msg,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.white.withValues(alpha: 0.7),
            fontSize: 15,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Не удалось загрузить отзывы.',
              textAlign: TextAlign.center,
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
                style: TextStyle(color: AppColors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
