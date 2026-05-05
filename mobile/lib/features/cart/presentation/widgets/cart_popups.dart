import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/action_dialog.dart';

/// Result of the post-add popup. The detail page uses this to either dismiss
/// the popup (and stay on the product) or to navigate to the cart tab.
enum CartAddedChoice { continueShopping, goToCart }

/// Shown right after the user taps "В корзину" on a product detail page.
/// Returns null if the popup is dismissed by tapping outside.
Future<CartAddedChoice?> showCartAddedPopup(BuildContext context) {
  return showDialog<CartAddedChoice>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => ActionDialog(
      icon: _cartIcon(),
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
    builder: (ctx) => ActionDialog(
      icon: _cartIcon(),
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
    builder: (ctx) => ActionDialog(
      icon: _cartIcon(),
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
    builder: (ctx) => ActionDialog(
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

Widget _cartIcon() => SvgPicture.asset(
  'assets/icons/cart/cart.svg',
  width: 50,
  height: 50,
  colorFilter: const ColorFilter.mode(AppColors.white, BlendMode.srcIn),
);
