import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/product.dart';
import '../controller/favorite_ids_controller.dart';
import '../controller/favorite_products_controller.dart';
import '../widgets/brand_logotype.dart';

/// "Избранное" tab. Three states: empty (illustration + CTA to catalog),
/// loaded (iOS-style grouped list by category, alphabetical), error.
///
/// [onGoToCatalog] is invoked from the empty-state CTA — the shell owns the
/// tab index, so the page hands back rather than navigating itself.
class FavoritesPage extends ConsumerWidget {
  final VoidCallback onGoToCatalog;
  const FavoritesPage({super.key, required this.onGoToCatalog});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncProducts = ref.watch(favoriteProductsProvider);

    return Column(
      children: [
        _AppBar(
          onSearchTap: () => context.push('/client/search'),
        ),
        Expanded(
          child: asyncProducts.when(
            data: (products) {
              if (products.isEmpty) {
                return _EmptyState(onGoToCatalog: onGoToCatalog);
              }
              return _GroupedList(products: products);
            },
            loading: () => const _LoadingState(),
            error: (_, _) => _ErrorState(
              onRetry: () =>
                  ref.read(favoriteProductsProvider.notifier).refresh(),
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 8, 0),
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
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(
              'Избранное',
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

class _EmptyState extends StatelessWidget {
  final VoidCallback onGoToCatalog;
  const _EmptyState({required this.onGoToCatalog});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(
              'assets/icons/favorites/favorites_empty.svg',
              width: 100,
              height: 100,
            ),
            const SizedBox(height: 24),
            const Text(
              'Здесь пока ничего нет...',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Вы можете добавлять сюда услуги которые вам понравились больше всего.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.purpleTertiary,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                height: 1.34,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 24),
            _YellowButton(
              label: 'Перейти в каталог',
              onTap: onGoToCatalog,
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupedList extends ConsumerWidget {
  final List<Product> products;
  const _GroupedList({required this.products});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = _group(products);
    return RefreshIndicator(
      onRefresh: () =>
          ref.read(favoriteProductsProvider.notifier).refresh(),
      color: AppColors.purplePrimary,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(top: 8, bottom: 24),
        itemCount: groups.length,
        itemBuilder: (ctx, i) {
          final g = groups[i];
          return _GroupSection(
            categoryName: g.name,
            products: g.products,
          );
        },
      ),
    );
  }

  // Alphabetical by category name. Products with no category fall into
  // a "Без категории" bucket placed last so the grouped list still has a
  // stable rendering even for incomplete data.
  static List<_Group> _group(List<Product> products) {
    final byKey = <String, List<Product>>{};
    final names = <String, String>{};
    for (final p in products) {
      final key = p.category?.name ?? '';
      byKey.putIfAbsent(key, () => []).add(p);
      names[key] = key.isEmpty ? 'Без категории' : key;
    }
    final keys = byKey.keys.toList()
      ..sort((a, b) {
        if (a.isEmpty && b.isNotEmpty) return 1;
        if (b.isEmpty && a.isNotEmpty) return -1;
        return a.compareTo(b);
      });
    return [
      for (final k in keys)
        _Group(name: names[k]!, products: byKey[k]!),
    ];
  }
}

class _Group {
  final String name;
  final List<Product> products;
  _Group({required this.name, required this.products});
}

class _GroupSection extends StatelessWidget {
  final String categoryName;
  final List<Product> products;
  const _GroupSection({required this.categoryName, required this.products});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 0, 32, 7),
            child: Text(
              categoryName,
              style: TextStyle(
                color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
                fontSize: 13,
                fontWeight: FontWeight.w500,
                height: 16 / 13,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Column(
                children: [
                  for (var i = 0; i < products.length; i++)
                    _FavoriteRow(
                      product: products[i],
                      isLast: i == products.length - 1,
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FavoriteRow extends ConsumerWidget {
  final Product product;
  final bool isLast;
  const _FavoriteRow({required this.product, required this.isLast});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Dismissible(
      key: ValueKey('fav-${product.id}'),
      direction: DismissDirection.startToEnd,
      background: _DismissBackground(),
      confirmDismiss: (_) => _onConfirmDismiss(context, ref),
      child: Material(
        color: AppColors.white.withValues(alpha: 0.1),
        child: InkWell(
          onTap: () => context.push(
            '/client/products/${product.id}',
            extra: product,
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: !isLast
                ? BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: AppColors.purpleTertiary.withValues(alpha: 0.2),
                        width: 0.5,
                      ),
                    ),
                  )
                : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      product.title,
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
                  const SizedBox(width: 8),
                  Icon(
                    Icons.chevron_right,
                    color: AppColors.purpleTertiary.withValues(alpha: 0.9),
                    size: 22,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<bool> _onConfirmDismiss(BuildContext context, WidgetRef ref) async {
    final confirmed = await _showRemoveDialog(context);
    if (!confirmed) return false;
    try {
      await ref.read(favoriteIdsProvider.notifier).toggle(product.id);
      return true;
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Не удалось убрать из избранного'),
          ),
        );
      }
      return false;
    }
  }
}

class _DismissBackground extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.redError.withValues(alpha: 0.3),
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.only(left: 16),
      child: SvgPicture.asset(
        'assets/icons/favorites/favorites_remove.svg',
        width: 24,
        height: 24,
        colorFilter: const ColorFilter.mode(
          AppColors.white,
          BlendMode.srcIn,
        ),
      ),
    );
  }
}

Future<bool> _showRemoveDialog(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.purpleGradientTop,
              AppColors.purplePrimary,
            ],
          ),
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(
              'assets/icons/favorites/favorites_remove.svg',
              width: 50,
              height: 50,
              colorFilter: const ColorFilter.mode(
                AppColors.white,
                BlendMode.srcIn,
              ),
            ),
            const SizedBox(height: 24),
            const SizedBox(
              width: 252,
              child: Text(
                'Вы уверены что хотите убрать товар из избранных?',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            const SizedBox(height: 24),
            _YellowButton(
              label: 'Подтвердить',
              height: 48,
              radius: 12,
              fullWidth: true,
              onTap: () => Navigator.of(ctx).pop(true),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text(
                  'Отмена',
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
  return result == true;
}

class _YellowButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final double height;
  final double radius;
  final bool fullWidth;

  const _YellowButton({
    required this.label,
    required this.onTap,
    this.height = 54,
    this.radius = 14,
    this.fullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    final body = SizedBox(
      height: height,
      width: fullWidth ? double.infinity : null,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                AppColors.yellowGradientTop,
                AppColors.yellowGradientBottom,
              ],
            ),
            borderRadius: BorderRadius.circular(radius),
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(radius),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Center(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.purpleDark,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    return body;
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();
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
            'Не удалось загрузить избранное',
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
