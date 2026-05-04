import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../../core/design/tokens.dart';

/// Result of the post-add popup. The detail page uses this to either dismiss
/// the popup (and stay on the product) or to navigate to the cart tab.
enum CartAddedChoice { continueShopping, goToCart }

/// Shown right after the user taps "В корзину" on a product detail page.
/// Returns null if the popup is dismissed by tapping outside.
Future<CartAddedChoice?> showCartAddedPopup(BuildContext context) {
  return showDialog<CartAddedChoice>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => _CartActionDialog(
      title: 'Товар добавлен в корзину',
      primaryLabel: 'Перейти в корзину',
      secondaryLabel: 'Продолжить покупки',
      onPrimary: () => Navigator.of(ctx).pop(CartAddedChoice.goToCart),
      onSecondary: () =>
          Navigator.of(ctx).pop(CartAddedChoice.continueShopping),
    ),
  );
}

/// Confirms removal when the user taps the "В корзине" CTA on a product
/// detail page (a soft undo for the cart-add). Returns true on confirmation,
/// false/null on cancel or barrier tap.
Future<bool> showCartRemoveConfirmPopup(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => _CartActionDialog(
      title: 'Убрать товар из корзины?',
      primaryLabel: 'Убрать',
      secondaryLabel: 'Отмена',
      onPrimary: () => Navigator.of(ctx).pop(true),
      onSecondary: () => Navigator.of(ctx).pop(false),
    ),
  );
  return result == true;
}

/// Asks the user whether to overwrite an already-in-cart entry of the same
/// product with a new time slot. Reuses the same dialog shell as add/remove
/// for consistency. Returns true on confirmation, false/null on cancel.
Future<bool> showCartReplaceConfirmPopup(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => _CartActionDialog(
      title: 'Заменить товар в корзине новым временем?',
      primaryLabel: 'Заменить',
      secondaryLabel: 'Отмена',
      onPrimary: () => Navigator.of(ctx).pop(true),
      onSecondary: () => Navigator.of(ctx).pop(false),
    ),
  );
  return result == true;
}

/// Shown when the user tries to add a second, different product to a cart
/// that already has one. Mirrors the 1-order-per-product rule enforced by
/// the backend. Returns true if the user picked "Перейти в корзину" so the
/// caller can navigate; null/false on cancel or barrier tap.
Future<bool> showCartFullPopup(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => _CartActionDialog(
      icon: const Icon(
        Icons.remove_shopping_cart_outlined,
        size: 50,
        color: AppColors.white,
      ),
      title: 'В корзине уже есть товар',
      subtitle:
          'Вы можете оформить заказ только на 1 продукт за раз. Чтобы добавить новый товар, сначала завершите текущий заказ.',
      primaryLabel: 'Перейти в корзину',
      secondaryLabel: 'Отмена',
      onPrimary: () => Navigator.of(ctx).pop(true),
      onSecondary: () => Navigator.of(ctx).pop(false),
    ),
  );
  return result == true;
}

class _CartActionDialog extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? icon;
  final String primaryLabel;
  final String secondaryLabel;
  final VoidCallback onPrimary;
  final VoidCallback onSecondary;

  const _CartActionDialog({
    required this.title,
    this.subtitle,
    this.icon,
    required this.primaryLabel,
    required this.secondaryLabel,
    required this.onPrimary,
    required this.onSecondary,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppColors.purpleGradientTop, AppColors.purplePrimary],
          ),
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            icon ??
                SvgPicture.asset(
                  'assets/icons/cart/cart.svg',
                  width: 50,
                  height: 50,
                  colorFilter: const ColorFilter.mode(
                    AppColors.white,
                    BlendMode.srcIn,
                  ),
                ),
            const SizedBox(height: 24),
            SizedBox(
              width: 252,
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: 252,
                child: Text(
                  subtitle!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.6),
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    height: 1.34,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
            _PrimaryYellowButton(label: primaryLabel, onTap: onPrimary),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: onSecondary,
                child: Text(
                  secondaryLabel,
                  style: const TextStyle(
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
    );
  }
}

class _PrimaryYellowButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _PrimaryYellowButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
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
            borderRadius: BorderRadius.circular(12),
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(12),
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
    );
  }
}
