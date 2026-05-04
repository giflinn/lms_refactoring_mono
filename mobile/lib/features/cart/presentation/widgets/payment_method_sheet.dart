import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/network/api_exceptions.dart';
import '../../../orders/data/orders_api.dart';
import '../../../orders/data/orders_api_provider.dart';
import '../controller/cart_controller.dart';
import 'cart_item_card.dart';

/// Centered modal: "Выберите способ оплаты". Two payment rows (Kaspi, bank
/// card) + cancel. Bank is intentionally disabled with a "Скоро" badge —
/// only Kaspi has a flow today, and even that is a manual receipt-via-chat
/// stub until proper order creation lands.
///
/// Show via [showPaymentMethodPopup]. Returns when the user taps cancel or
/// completes a flow.
Future<void> showPaymentMethodPopup(
  BuildContext context, {
  required num totalTenge,
}) async {
  await showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => _PaymentMethodDialog(totalTenge: totalTenge),
  );
}

class _PaymentMethodDialog extends StatelessWidget {
  final num totalTenge;
  const _PaymentMethodDialog({required this.totalTenge});

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
            const Text(
              'Выберите способ оплаты',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 24),
            _MethodRow(
              logo: const _KaspiLogo(),
              title: 'Kaspi',
              subtitle: 'Комиссия 0%\nАктивация покупки в течение 3 часов',
              onTap: () {
                Navigator.of(context).pop();
                _showKaspiInstructions(context, totalTenge: totalTenge);
              },
            ),
            const SizedBox(height: 8),
            const _MethodRow(
              logo: _BankLogo(),
              title: 'Банковская карта',
              subtitle: 'Комиссия 2%\nМоментальная активация покупки',
              disabled: true,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(
                    color: AppColors.white.withValues(alpha: 0.2),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Отмена',
                  style: TextStyle(
                    color: AppColors.purpleTertiary,
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

class _MethodRow extends StatelessWidget {
  final Widget logo;
  final String title;
  final String subtitle;
  final bool disabled;
  final VoidCallback? onTap;

  const _MethodRow({
    required this.logo,
    required this.title,
    required this.subtitle,
    this.disabled = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final body = Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          SizedBox(width: 42, height: 42, child: logo),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        style: const TextStyle(
                          color: AppColors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          height: 1.3,
                        ),
                      ),
                    ),
                    if (disabled) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(100),
                        ),
                        child: Text(
                          'Скоро',
                          style: TextStyle(
                            color: AppColors.white.withValues(alpha: 0.7),
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: AppColors.purpleTertiary,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
          if (!disabled)
            Icon(
              Icons.chevron_right,
              color: AppColors.purpleTertiary.withValues(alpha: 0.9),
              size: 22,
            ),
        ],
      ),
    );

    if (disabled) {
      return Opacity(opacity: 0.55, child: body);
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

/// Kaspi brand mark. The asset is already a red circle with the figure, so
/// we render it raw at whatever size the parent gives us.
class _KaspiLogo extends StatelessWidget {
  const _KaspiLogo();

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/icons/cart/kaspi.png',
      fit: BoxFit.contain,
    );
  }
}

/// Bank-card brand mark — already a circular illustration with its own
/// background, so we render it raw at whatever size the parent gives us.
class _BankLogo extends StatelessWidget {
  const _BankLogo();

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/icons/cart/bank_card.png',
      fit: BoxFit.contain,
    );
  }
}

Future<void> _showKaspiInstructions(
  BuildContext context, {
  required num totalTenge,
}) async {
  await showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => _KaspiInstructionsDialog(totalTenge: totalTenge),
  );
}

class _KaspiInstructionsDialog extends ConsumerStatefulWidget {
  final num totalTenge;
  const _KaspiInstructionsDialog({required this.totalTenge});

  @override
  ConsumerState<_KaspiInstructionsDialog> createState() =>
      _KaspiInstructionsDialogState();
}

class _KaspiInstructionsDialogState
    extends ConsumerState<_KaspiInstructionsDialog> {
  bool _creating = false;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
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
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(
              child: SizedBox(
                width: 50,
                height: 50,
                child: _KaspiLogo(),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Оплата через Kaspi',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                'К оплате: ${formatTenge(widget.totalTenge)} ₸',
                style: const TextStyle(
                  color: AppColors.yellowPrimary,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            const SizedBox(height: 20),
            const _Step(
              num: '1',
              text: 'Нажмите кнопку ниже — откроется приложение Kaspi.',
            ),
            const SizedBox(height: 12),
            _Step(
              num: '2',
              text:
                  'Оплатите указанную сумму — ${formatTenge(widget.totalTenge)} ₸.',
            ),
            const SizedBox(height: 12),
            const _Step(
              num: '3',
              text:
                  'Напишите менеджеру в чат, что вы оплатили, и пришлите ссылку на чек.',
            ),
            const SizedBox(height: 24),
            SizedBox(
              height: 54,
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
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: InkWell(
                    onTap: _creating ? null : _openKaspi,
                    borderRadius: BorderRadius.circular(14),
                    child: Center(
                      child: _creating
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: AppColors.purpleDark,
                              ),
                            )
                          : const Text(
                              'Открыть Kaspi',
                              style: TextStyle(
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
            const SizedBox(height: 8),
            SizedBox(
              height: 48,
              child: TextButton(
                onPressed: _creating ? null : () => Navigator.of(context).pop(),
                child: const Text(
                  'Закрыть',
                  style: TextStyle(
                    color: AppColors.purpleTertiary,
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

  /// Creates the order on the server first, clears the local cart, then
  /// hands the user off to Kaspi. If order creation fails we keep the user
  /// in the dialog with a snackbar — they shouldn't be sent to Kaspi for a
  /// purchase that didn't get recorded.
  Future<void> _openKaspi() async {
    if (_creating) return;
    setState(() => _creating = true);

    final messenger = ScaffoldMessenger.maybeOf(context);

    try {
      final cart = ref.read(cartProvider);
      if (cart.isEmpty) {
        if (mounted) Navigator.of(context).pop();
        return;
      }
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        _showError('Войдите в аккаунт, чтобы продолжить');
        return;
      }
      final idToken = await user.getIdToken();
      if (idToken == null || idToken.isEmpty) {
        _showError('Не удалось получить токен. Попробуйте перезайти.');
        return;
      }

      try {
        await ref
            .read(ordersApiProvider)
            .createOrder(
              items: cart
                  .map(
                    (c) => CreateOrderItemInput(
                      productId: c.productId,
                      bookedStart: c.bookedStart,
                    ),
                  )
                  .toList(),
              idToken: idToken,
            );
      } on OrderCreationException catch (e) {
        if (mounted) _showError(_messageForCode(e.code));
        return;
      }

      ref.read(cartProvider.notifier).clear();
      if (!mounted) return;
      Navigator.of(context).pop();

      final uri = Uri.parse('https://kaspi.kz');
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) {
        messenger?.showSnackBar(
          const SnackBar(content: Text('Не удалось открыть Kaspi')),
        );
      }
    } on NetworkException {
      if (mounted) _showError('Нет соединения с сервером');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(msg)));
  }

  String _messageForCode(String code) {
    switch (code) {
      case 'slot_taken':
        return 'Это время уже забронировано. Выберите другое.';
      case 'slot_unavailable':
        return 'Слот недоступен. Попробуйте другое время.';
      case 'product_inactive':
      case 'product_not_found':
        return 'Один из товаров больше недоступен.';
      case 'product_not_orderable':
        return 'Этот товар нельзя заказать напрямую — напишите менеджеру.';
      case 'product_misconfigured':
        return 'Этот товар нельзя забронировать — напишите менеджеру.';
      case 'booked_start_in_past':
      case 'invalid_booked_start':
      case 'booked_start_required':
        return 'Время бронирования некорректно. Выберите снова.';
      case 'forbidden':
        return 'Только клиенты могут создавать заказы.';
      default:
        return 'Не удалось создать заказ. Попробуйте позже.';
    }
  }
}

class _Step extends StatelessWidget {
  final String num;
  final String text;
  const _Step({required this.num, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.yellowPrimary,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            num,
            style: const TextStyle(
              color: AppColors.purpleDark,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 14,
              fontWeight: FontWeight.w500,
              height: 1.4,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ],
    );
  }
}
