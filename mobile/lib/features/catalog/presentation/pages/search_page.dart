import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../domain/product.dart';
import '../controller/search_controller.dart';
import '../widgets/product_row.dart';
import '../widgets/search_empty_state.dart';

class CatalogSearchPage extends ConsumerStatefulWidget {
  const CatalogSearchPage({super.key});

  @override
  ConsumerState<CatalogSearchPage> createState() => _CatalogSearchPageState();
}

class _CatalogSearchPageState extends ConsumerState<CatalogSearchPage> {
  late final TextEditingController _textController;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _textController = TextEditingController();
    _focusNode = FocusNode();
    // Auto-focus the input so the keyboard slides up immediately — search
    // screens that don't open the keyboard feel broken on mobile.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(searchControllerProvider);
    final notifier = ref.read(searchControllerProvider.notifier);

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: PreferredSize(
          preferredSize: const Size.fromHeight(110),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 12, 12),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => context.pop(),
                    icon: const Icon(
                      Icons.arrow_back_ios_new,
                      color: AppColors.white,
                      size: 20,
                    ),
                    tooltip: 'Назад',
                  ),
                  Expanded(
                    child: _SearchInput(
                      controller: _textController,
                      focusNode: _focusNode,
                      onChanged: notifier.onQueryChanged,
                      onClear: () {
                        _textController.clear();
                        notifier.onQueryChanged('');
                        _focusNode.requestFocus();
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        body: _Body(state: state),
      ),
    );
  }
}

class _SearchInput extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  const _SearchInput({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 36,
      decoration: BoxDecoration(
        color: const Color(0x1A273043),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          const SizedBox(width: 8),
          Icon(
            Icons.search,
            size: 18,
            color: AppColors.purpleTertiary.withValues(alpha: 0.95),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              onChanged: onChanged,
              cursorColor: AppColors.white,
              style: const TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
              ),
              decoration: InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
                hintText: 'Поиск',
                hintStyle: TextStyle(
                  color: AppColors.purpleTertiary.withValues(alpha: 0.95),
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                ),
              ),
              textInputAction: TextInputAction.search,
            ),
          ),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: controller,
            builder: (ctx, value, _) {
              if (value.text.isEmpty) return const SizedBox.shrink();
              return IconButton(
                onPressed: onClear,
                icon: const Icon(Icons.cancel, size: 18),
                color: AppColors.purpleTertiary.withValues(alpha: 0.95),
                tooltip: 'Очистить',
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(width: 32),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final SearchState state;
  const _Body({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = state.query.trim();

    // No query yet → just show popular as a discoverable list.
    if (query.isEmpty) {
      return _PopularList(
        header: 'Популярное',
        showHeader: true,
      );
    }

    if (state.loading && state.results == null) {
      return const _LoadingPlaceholder();
    }

    if (state.error != null && state.results == null) {
      return _ErrorState(
        onRetry: () => ref.read(searchControllerProvider.notifier).retry(),
      );
    }

    final results = state.results ?? const <Product>[];
    if (results.isEmpty) {
      return ListView(
        padding: const EdgeInsets.only(top: 16, bottom: 24),
        children: [
          const SearchEmptyState(),
          const SizedBox(height: 16),
          const _SectionHeader(label: 'Популярное'),
          const _PopularListInline(),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.only(top: 16, bottom: 24),
      children: _groupedRows(results),
    );
  }

  static List<Widget> _groupedRows(List<Product> products) {
    // Group by category (preserving server order — newest first per category).
    final byId = <String, List<Product>>{};
    final names = <String, String>{};
    final order = <String>[];
    for (final p in products) {
      final id = p.category?.id ?? '__none__';
      if (!byId.containsKey(id)) {
        byId[id] = [];
        names[id] = p.category?.name ?? 'Без категории';
        order.add(id);
      }
      byId[id]!.add(p);
    }

    final widgets = <Widget>[];
    for (final id in order) {
      widgets.add(_SectionHeader(label: names[id]!));
      widgets.addAll(byId[id]!.map((p) => ProductRow(product: p)));
      widgets.add(const SizedBox(height: 8));
    }
    return widgets;
  }
}

class _SectionHeader extends StatelessWidget {
  final String label;
  const _SectionHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Text(
        label,
        style: TextStyle(
          color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
          fontSize: 13,
          height: 1.23,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

/// Used as the body when there's no query yet — full-screen "Популярное" list.
class _PopularList extends ConsumerWidget {
  final String header;
  final bool showHeader;
  const _PopularList({required this.header, required this.showHeader});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPopular = ref.watch(popularProductsProvider);
    return asyncPopular.when(
      data: (products) {
        if (products.isEmpty) return const _NoPopular();
        return ListView(
          padding: const EdgeInsets.only(top: 16, bottom: 24),
          children: [
            if (showHeader)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Text(
                  header,
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w500,
                    height: 1.2,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            for (final p in products) ProductRow(product: p),
          ],
        );
      },
      loading: () => const _LoadingPlaceholder(),
      error: (_, _) => const _NoPopular(),
    );
  }
}

/// Used as a sub-section under the empty-search state — no big "Популярное"
/// header (the parent renders its own).
class _PopularListInline extends ConsumerWidget {
  const _PopularListInline();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncPopular = ref.watch(popularProductsProvider);
    return asyncPopular.when(
      data: (products) {
        if (products.isEmpty) return const SizedBox.shrink();
        return Column(
          children: [for (final p in products) ProductRow(product: p)],
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.white,
            ),
          ),
        ),
      ),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

class _NoPopular extends StatelessWidget {
  const _NoPopular();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          'Введите запрос для поиска',
          style: TextStyle(
            color: AppColors.white.withValues(alpha: 0.7),
            fontSize: 15,
          ),
        ),
      ),
    );
  }
}

class _LoadingPlaceholder extends StatelessWidget {
  const _LoadingPlaceholder();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: SizedBox(
        width: 28,
        height: 28,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          color: AppColors.white,
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorState({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.cloud_off_outlined,
            color: AppColors.white.withValues(alpha: 0.7),
            size: 48,
          ),
          const SizedBox(height: 16),
          Text(
            'Ошибка поиска',
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.85),
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.yellowGradientTop,
            ),
            child: const Text('Повторить'),
          ),
        ],
      ),
    );
  }
}
