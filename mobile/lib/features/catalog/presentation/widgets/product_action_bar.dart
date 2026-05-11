import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/terms_checkbox_row.dart';
import '../../../cart/domain/cart_item.dart';
import '../../../cart/presentation/controller/cart_controller.dart';
import '../../../cart/presentation/widgets/cart_popups.dart';
import '../../../home/presentation/controller/client_shell_tab_controller.dart';
import '../../domain/product.dart';
import '../../domain/ru_dates.dart';

/// Pinned bottom bar on the product detail page. Three CTA states:
///
/// 1. "По запросу" (`product.price == null`) — terms hidden; CTA "Перейти в
///    чат" pops the detail and switches the client shell to the chat tab.
/// 2. Priced + not in cart — terms gate; CTA "В корзину" adds the product
///    and surfaces a "Continue / Go to cart" popup.
/// 3. Priced + already in cart — terms hidden (the user already accepted on
///    add); CTA morphs to outlined "В корзине" which opens a confirm-remove
///    popup.
class ProductActionBar extends ConsumerWidget {
  final Product product;
  final AvailableStart? selectedStart;
  final bool termsAccepted;
  final ValueChanged<bool> onTermsChanged;
  const ProductActionBar({
    super.key,
    required this.product,
    required this.termsAccepted,
    required this.onTermsChanged,
    this.selectedStart,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final isOnRequest = product.price == null;
    final isBookable = product.isBookable;
    final hasSelection = selectedStart != null;
    final subtitleText = _subtitleText(product, selectedStart);
    // "In cart" only counts when both the product *and* the picked slot
    // match — otherwise switching to a new time keeps the CTA as "В
    // корзину" so the user can replace the existing entry instead of
    // being silently blocked by the morphed "В корзине" remove button.
    final inCart = ref
        .watch(cartProvider)
        .any(
          (it) =>
              it.productId == product.id &&
              _sameSlot(it.bookedStart, selectedStart?.startsAt),
        );

    final showTerms = !isOnRequest && !inCart;
    final canAdd =
        !isOnRequest && (isBookable ? hasSelection : true) && termsAccepted;

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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showTerms)
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 2, 4, 12),
              child: TermsCheckboxRow(
                value: termsAccepted,
                onChanged: onTermsChanged,
              ),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (subtitleText != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Text(
                          subtitleText,
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
                        color: isOnRequest
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
              if (isOnRequest)
                _CtaButton.filled(
                  label: 'Перейти в чат',
                  onTap: () => _onChatTap(context, ref),
                )
              else if (inCart)
                _CtaButton.outlined(
                  label: 'В корзине',
                  onTap: () => _onRemoveTap(context, ref),
                )
              else
                _CtaButton.filled(
                  label: 'В корзину',
                  enabled: canAdd,
                  onTap: () => _onAddTap(context, ref),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _onAddTap(BuildContext context, WidgetRef ref) async {
    final priceNum = num.tryParse(product.price ?? '');
    if (priceNum == null) return;

    final cart = ref.read(cartProvider);

    // 1-order-per-product rule (matches the backend POST /orders, which
    // refuses multi-item requests). If the cart already holds a *different*
    // product, we don't silently replace it — we surface the popup so the
    // user knows their previous selection isn't going anywhere.
    final differentProduct = cart
        .where((it) => it.productId != product.id)
        .firstOrNull;
    if (differentProduct != null) {
      final goToCart = await showCartFullPopup(context);
      if (goToCart && context.mounted) {
        ref.read(clientShellTabProvider.notifier).goTo(2);
        context.pop();
      }
      return;
    }

    // Same product, different slot — ask before replacing the slot. The
    // controller itself replaces by productId so the mutation is the same;
    // the dialog only adds the consent step.
    final existing = cart
        .where((it) => it.productId == product.id)
        .firstOrNull;
    if (existing != null &&
        !_sameSlot(existing.bookedStart, selectedStart?.startsAt)) {
      final confirmed = await showCartReplaceConfirmPopup(context);
      if (!confirmed || !context.mounted) return;
      ref
          .read(cartProvider.notifier)
          .add(
            CartItem(
              product: product,
              price: priceNum,
              bookedStart: selectedStart?.startsAt,
            ),
          );
      // Skip the standard "added" popup — the explicit replace confirm is
      // already an interaction; chaining a second dialog would feel noisy.
      return;
    }

    ref
        .read(cartProvider.notifier)
        .add(
          CartItem(
            product: product,
            price: priceNum,
            bookedStart: selectedStart?.startsAt,
          ),
        );
    final choice = await showCartAddedPopup(context);
    if (choice == CartAddedChoice.goToCart && context.mounted) {
      ref.read(clientShellTabProvider.notifier).goTo(2);
      context.pop();
    }
  }

  Future<void> _onRemoveTap(BuildContext context, WidgetRef ref) async {
    final confirmed = await showCartRemoveConfirmPopup(context);
    if (confirmed) {
      ref.read(cartProvider.notifier).remove(product.id);
    }
  }

  void _onChatTap(BuildContext context, WidgetRef ref) {
    ref.read(clientShellTabProvider.notifier).goTo(1);
    context.pop();
  }
}

/// Pill-shaped CTA on the action bar. Two visual variants — yellow filled for
/// primary actions ("В корзину", "Перейти в чат"), and a transparent outline
/// for the in-cart state ("В корзине") so it reads as a secondary action.
class _CtaButton extends StatelessWidget {
  final String label;
  final bool enabled;
  final VoidCallback onTap;
  final bool _outlined;

  const _CtaButton.filled({
    required this.label,
    required this.onTap,
    this.enabled = true,
  }) : _outlined = false;

  const _CtaButton.outlined({required this.label, required this.onTap})
    : _outlined = true,
      enabled = true;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      height: 54,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      alignment: Alignment.center,
      decoration: _outlined
          ? BoxDecoration(
              color: Colors.transparent,
              border: Border.all(
                color: AppColors.white.withValues(alpha: 0.4),
                width: 1.5,
              ),
              borderRadius: BorderRadius.circular(14),
            )
          : BoxDecoration(
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
        style: TextStyle(
          color: _outlined ? AppColors.white : AppColors.purpleDark,
          fontSize: 15,
          fontWeight: FontWeight.w500,
          height: 1.34,
          letterSpacing: -0.4,
        ),
      ),
    );
    if (!enabled) {
      return Opacity(opacity: 0.6, child: body);
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

// Compare two slot timestamps tolerant of UTC/local flag differences —
// `==` on DateTime returns false when the isUtc flag differs even at the
// same instant, but the cart and the picker can disagree on that flag.
bool _sameSlot(DateTime? a, DateTime? b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.isAtSameMomentAs(b);
}

String? _subtitleText(Product product, AvailableStart? selectedStart) {
  if (selectedStart != null) {
    final local = selectedStart.startsAt.toLocal();
    return '${local.day} ${monthGenitive(local.month)}, ${hhmm(local)}';
  }
  final raw = product.subtitle?.trim();
  if (raw == null || raw.isEmpty) return null;
  return raw;
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
