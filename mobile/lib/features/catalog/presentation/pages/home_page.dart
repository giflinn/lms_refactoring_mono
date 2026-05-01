import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../data/catalog_api_provider.dart';
import '../../domain/catalog_snapshot.dart';
import '../../domain/product.dart';
import '../controller/home_controller.dart';
import '../widgets/brand_logotype.dart';
import '../widgets/category_tab.dart';
import '../widgets/home_skeleton.dart';
import '../widgets/product_row.dart';
import '../widgets/promo_carousel.dart';

/// Client home tab. Composition:
///   AppBar: brand "Slyamova Zhanna" left, search icon right
///   Body :
///     - Promo carousel (auto-rotating; hidden if no promo products)
///     - "Каталог" header
///     - Horizontal category tabs (only categories that have products)
///     - Vertical list of products in the selected category
class CatalogHomePage extends ConsumerStatefulWidget {
  const CatalogHomePage({super.key});

  @override
  ConsumerState<CatalogHomePage> createState() => _CatalogHomePageState();
}

class _CatalogHomePageState extends ConsumerState<CatalogHomePage> {
  String? _selectedCategoryId;

  @override
  Widget build(BuildContext context) {
    final asyncSnapshot = ref.watch(homeCatalogProvider);
    return Column(
      children: [
        _AppBar(
          onSearchTap: () => context.push('/client/search'),
        ),
        Expanded(
          child: asyncSnapshot.when(
            data: (snapshot) => _Body(
              snapshot: snapshot,
              selectedCategoryId: _selectedCategoryId,
              onSelectCategory: (id) => setState(() => _selectedCategoryId = id),
              onRefresh: () => ref.read(homeCatalogProvider.notifier).refresh(),
            ),
            loading: () => const HomeSkeleton(),
            error: (e, _) => _ErrorState(
              onRetry: () => ref.read(homeCatalogProvider.notifier).refresh(),
            ),
          ),
        ),
      ],
    );
  }
}

class _AppBar extends StatelessWidget {
  final VoidCallback onSearchTap;
  const _AppBar({required this.onSearchTap});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 8, 8),
        child: Row(
          children: [
            const BrandLogotype(height: 26),
            const Spacer(),
            IconButton(
              onPressed: onSearchTap,
              icon: SvgPicture.asset(
                'assets/icons/search/search.svg',
                width: 24,
                height: 24,
                colorFilter: const ColorFilter.mode(
                  AppColors.white,
                  BlendMode.srcIn,
                ),
              ),
              tooltip: 'Поиск',
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  final CatalogSnapshot snapshot;
  final String? selectedCategoryId;
  final ValueChanged<String> onSelectCategory;
  final Future<void> Function() onRefresh;

  const _Body({
    required this.snapshot,
    required this.selectedCategoryId,
    required this.onSelectCategory,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(catalogApiProvider);
    final categories = snapshot.categoriesWithProducts;
    // Resolve the active category: prefer the user's pick if it still maps to
    // a non-empty category; otherwise fall back to the first one.
    final effectiveCategoryId = (() {
      if (categories.isEmpty) return null;
      if (selectedCategoryId != null &&
          categories.any((c) => c.id == selectedCategoryId)) {
        return selectedCategoryId;
      }
      return categories.first.id;
    })();
    final visibleProducts = effectiveCategoryId == null
        ? <Product>[]
        : snapshot.productsForCategory(effectiveCategoryId);
    final promo = snapshot.promo;

    return RefreshIndicator(
      onRefresh: onRefresh,
      color: AppColors.purplePrimary,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 8, bottom: 24),
        children: [
          if (promo.isNotEmpty)
            PromoCarousel(
              products: promo,
              api: api,
              onTap: (p) => _openDetail(context, p),
            ),
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Text(
              'Каталог',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 28,
                fontWeight: FontWeight.w500,
                height: 1.2,
                letterSpacing: -0.4,
              ),
            ),
          ),
          if (categories.isNotEmpty) ...[
            _CategoryStrip(
              categories: categories,
              selectedId: effectiveCategoryId!,
              onSelect: onSelectCategory,
            ),
            const SizedBox(height: 8),
          ],
          if (visibleProducts.isEmpty)
            const _EmptyCatalog()
          else
            for (final p in visibleProducts)
              ProductRow(
                product: p,
                onTap: () => _openDetail(context, p),
              ),
        ],
      ),
    );
  }

  static void _openDetail(BuildContext context, Product product) {
    context.push('/client/products/${product.id}', extra: product);
  }
}

class _CategoryStrip extends StatelessWidget {
  final List<CatalogCategory> categories;
  final String selectedId;
  final ValueChanged<String> onSelect;
  const _CategoryStrip({
    required this.categories,
    required this.selectedId,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 70,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        itemCount: categories.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final cat = categories[i];
          return CategoryTab(
            label: cat.name,
            selected: cat.id == selectedId,
            onTap: () => onSelect(cat.id),
          );
        },
      ),
    );
  }
}

class _EmptyCatalog extends StatelessWidget {
  const _EmptyCatalog();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 32, 16, 16),
      child: Center(
        child: Text(
          'Нет товаров',
          style: TextStyle(
            color: AppColors.white.withValues(alpha: 0.7),
            fontSize: 15,
          ),
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
            'Не удалось загрузить каталог',
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
