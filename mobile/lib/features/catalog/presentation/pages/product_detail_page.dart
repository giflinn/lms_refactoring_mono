import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../domain/product.dart';
import '../controller/favorite_ids_controller.dart';

/// Product detail screen. Composition:
///   Top bar : back arrow (left), heart toggle (right) — both white.
///   Body    : title, "Описание" + description, scrollable.
///   Bottom  : pinned action bar with subtitle + price + disabled CTA.
///
/// The page expects [product] in the route's `extra`. There's no fetch-by-id
/// fallback — all entry points (cards, rows, favorites list) push from a
/// loaded Product, so the round-trip is unnecessary.
class ProductDetailPage extends ConsumerWidget {
  final Product product;
  const ProductDetailPage({super.key, required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              _TopBar(productId: product.id),
              Expanded(child: _Body(product: product)),
              _ActionBar(product: product),
            ],
          ),
        ),
      ),
    );
  }
}

class _TopBar extends ConsumerWidget {
  final String productId;
  const _TopBar({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // .value is nullable — while the favorites set is loading we want the
    // heart to render outlined (the user hasn't favorited anything yet from
    // this view), not delay the UI.
    final ids = ref.watch(favoriteIdsProvider).value;
    final isFav = ids != null && ids.contains(productId);

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 8, 4),
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
          const Spacer(),
          IconButton(
            onPressed: () => _onToggle(context, ref),
            icon: SvgPicture.asset(
              isFav
                  ? 'assets/icons/nav/favorites_active.svg'
                  : 'assets/icons/nav/favorites_inactive.svg',
              width: 24,
              height: 24,
              colorFilter: const ColorFilter.mode(
                AppColors.white,
                BlendMode.srcIn,
              ),
            ),
            tooltip: isFav ? 'Убрать из избранного' : 'В избранное',
          ),
        ],
      ),
    );
  }

  Future<void> _onToggle(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(favoriteIdsProvider.notifier).toggle(productId);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Не удалось обновить избранное'),
        ),
      );
    }
  }
}

class _Body extends StatelessWidget {
  final Product product;
  const _Body({required this.product});

  @override
  Widget build(BuildContext context) {
    final hasDescription = product.description.trim().isNotEmpty;
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            product.title,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 28,
              fontWeight: FontWeight.w500,
              height: 1.2,
              letterSpacing: -0.4,
            ),
          ),
          if (hasDescription) ...[
            const SizedBox(height: 16),
            const Text(
              'Описание',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              product.description,
              style: const TextStyle(
                color: AppColors.purpleTertiary,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                height: 1.34,
                letterSpacing: -0.4,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  final Product product;
  const _ActionBar({required this.product});

  @override
  Widget build(BuildContext context) {
    final hasSubtitle =
        product.subtitle != null && product.subtitle!.trim().isNotEmpty;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.purplePrimary,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            offset: const Offset(0, -16),
            blurRadius: 17,
          ),
        ],
      ),
      padding: EdgeInsets.fromLTRB(
        12,
        12,
        12,
        bottomInset > 0 ? bottomInset : 12,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (hasSubtitle)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      product.subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.purpleTertiary,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        height: 1.34,
                        letterSpacing: -0.4,
                      ),
                    ),
                  ),
                Text(
                  _formatPrice(product.price),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: product.price == null
                        ? AppColors.purpleTertiary
                        : AppColors.yellowPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          const _BuyButton(),
        ],
      ),
    );
  }
}

class _BuyButton extends StatelessWidget {
  const _BuyButton();

  @override
  Widget build(BuildContext context) {
    // Disabled until checkout ships. Keep the gradient look but dim it and
    // skip the InkWell — taps go nowhere.
    return Opacity(
      opacity: 0.6,
      child: Container(
        height: 54,
        padding: const EdgeInsets.symmetric(horizontal: 24),
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
        child: const Text(
          'Купить сейчас',
          style: TextStyle(
            color: AppColors.purpleDark,
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

// "10000" → "10 000 ₸". Numeric column comes back as a string with up to 2
// decimals; we strip a trailing ".00" since the admin form is whole-tenge
// only today, but keep non-zero decimals if a future product has them.
String _formatPrice(String? raw) {
  if (raw == null) return 'По запросу';
  final value = num.tryParse(raw);
  if (value == null) return '$raw ₸';
  String body;
  if (value == value.truncate()) {
    body = _withThousandSpaces(value.toInt().toString());
  } else {
    final fixed = value.toStringAsFixed(2);
    final parts = fixed.split('.');
    body = '${_withThousandSpaces(parts[0])},${parts[1]}';
  }
  return '$body ₸';
}

String _withThousandSpaces(String digits) {
  return digits.replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]} ',
  );
}
