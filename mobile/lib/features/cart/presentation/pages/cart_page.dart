import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/terms_checkbox_row.dart';
import '../../../../core/widgets/brand_logotype.dart';
import '../../domain/cart_item.dart';
import '../controller/cart_controller.dart';
import '../widgets/cart_item_card.dart';
import '../widgets/payment_method_sheet.dart';

/// "Корзина" tab. Renders one of two states:
///   empty   — cart icon + CTA back to catalog.
///   filled  — list of [CartItem]s, total row, terms checkbox, and a sticky
///             "Перейти к оплате" button that opens [showPaymentMethodPopup].
///
/// Cart state is in-memory ([cartProvider]); order creation comes later.
/// The shell owns the tab index, so the empty-state CTA hands control back
/// via [onGoToCatalog] rather than navigating itself.
class CartPage extends ConsumerStatefulWidget {
  final VoidCallback onGoToCatalog;
  const CartPage({super.key, required this.onGoToCatalog});

  @override
  ConsumerState<CartPage> createState() => _CartPageState();
}

class _CartPageState extends ConsumerState<CartPage> {
  bool _termsAccepted = false;

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    return Column(
      // Stretch so _Header fills the screen horizontally — without this the
      // header sizes to its widest child (the BrandLogotype / "Корзина"
      // text) and the parent Column's default center alignment pushes it
      // into the middle of the screen instead of pinning it to the left.
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Header(),
        Expanded(
          child: items.isEmpty
              ? _EmptyState(onGoToCatalog: widget.onGoToCatalog)
              : _FilledState(
                  items: items,
                  termsAccepted: _termsAccepted,
                  onTermsChanged: (v) => setState(() => _termsAccepted = v),
                ),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: const [
          Padding(
            padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: BrandLogotype(height: 26),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Text(
              'Корзина',
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
              'assets/icons/cart/cart.svg',
              width: 100,
              height: 100,
            ),
            const SizedBox(height: 24),
            const Text(
              'Ваша корзина пуста',
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
              'Добавьте товары, чтобы начать.',
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
            _LargeYellowButton(
              label: 'Перейти в каталог',
              onTap: onGoToCatalog,
            ),
          ],
        ),
      ),
    );
  }
}

class _FilledState extends ConsumerWidget {
  final List<CartItem> items;
  final bool termsAccepted;
  final ValueChanged<bool> onTermsChanged;

  const _FilledState({
    required this.items,
    required this.termsAccepted,
    required this.onTermsChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final total = items.fold<num>(0, (sum, it) => sum + it.price);
    final canPay = termsAccepted;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            children: [
              for (final item in items) ...[
                CartItemCard(
                  item: item,
                  onRemove: () =>
                      ref.read(cartProvider.notifier).remove(item.productId),
                  onOpen: () => context.push(
                    '/client/products/${item.productId}',
                    extra: item.product,
                  ),
                ),
                const SizedBox(height: 16),
              ],
              Divider(
                color: AppColors.purpleTertiary.withValues(alpha: 0.2),
                height: 1,
                thickness: 1,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Итого к оплате',
                      style: TextStyle(
                        color: AppColors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w500,
                        height: 1.3,
                        letterSpacing: -0.4,
                      ),
                    ),
                  ),
                  Text(
                    '${formatTenge(total)} ₸',
                    style: const TextStyle(
                      color: AppColors.yellowPrimary,
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                      height: 1.3,
                      letterSpacing: -0.4,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TermsCheckboxRow(value: termsAccepted, onChanged: onTermsChanged),
            ],
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(
            16,
            8,
            16,
            16 + MediaQuery.of(context).padding.bottom,
          ),
          child: _LargeYellowButton(
            label: 'Перейти к оплате',
            enabled: canPay,
            onTap: () => showPaymentMethodPopup(context, totalTenge: total),
          ),
        ),
      ],
    );
  }
}

/// Pill button (54×14r) with the yellow gradient — the cart-area primary CTA.
/// Matches the "Перейти в каталог" / "Перейти к оплате" styling in the
/// Figma. Disabled state dims the gradient and swallows taps.
class _LargeYellowButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool enabled;

  const _LargeYellowButton({
    required this.label,
    required this.onTap,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final body = Container(
      height: 54,
      width: double.infinity,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.yellowGradientTop, AppColors.yellowGradientBottom],
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
    );
    if (!enabled) {
      return Opacity(opacity: 0.5, child: body);
    }
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: body,
      ),
    );
  }
}
