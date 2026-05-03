import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/terms_checkbox_row.dart';
import '../../domain/product.dart';
import '../../domain/ru_dates.dart';

/// Pinned bottom bar on the product detail page. Shows subtitle (either the
/// product's own copy or "29 апреля, 12:00" once the user picks a slot) plus
/// price + CTA. Tapping the CTA in any active state shows the
/// "Оформление заказа в разработке" snackbar — checkout isn't built yet.
class ProductActionBar extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final isBookable = product.isBookable;
    final hasSelection = selectedStart != null;
    final subtitleText = _subtitleText(product, selectedStart);
    // CTA: bookable products require a selected start; non-bookable products
    // keep the "checkout in development" stub. Terms must always be accepted.
    // Either path shows the "В разработке" snackbar when tapped — only the
    // active/dim styling differs.
    final canTap = (isBookable ? hasSelection : true) && termsAccepted;

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
              _BuyButton(enabled: canTap),
            ],
          ),
        ],
      ),
    );
  }
}

class _BuyButton extends StatelessWidget {
  final bool enabled;
  const _BuyButton({required this.enabled});

  @override
  Widget build(BuildContext context) {
    final body = Container(
      height: 54,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.yellowGradientTop, AppColors.yellowGradientBottom],
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
    );

    if (!enabled) {
      return Opacity(opacity: 0.6, child: body);
    }
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _showInDev(context),
        child: body,
      ),
    );
  }

  void _showInDev(BuildContext context) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Оформление заказа в разработке'),
        duration: Duration(seconds: 2),
      ),
    );
  }
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
