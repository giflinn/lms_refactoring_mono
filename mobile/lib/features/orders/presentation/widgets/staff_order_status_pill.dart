import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/staff_order.dart';

/// Status colors for staff badges. Tuned to read on the app's purple gradient
/// background (the admin web uses the same hues on white). Hardcoded here
/// because the tokens system doesn't yet have a green/info palette and these
/// values are status-specific, not brand-level.
class _StatusColors {
  static const greenSuccess = Color(0xFF34C759);
  static const orangeWarn = Color(0xFFFA8905);

  // Pending / Новый: neutral white-on-glass look.
  static Color neutralBg() => AppColors.white.withValues(alpha: 0.12);
  static Color neutralBorder() => AppColors.white.withValues(alpha: 0.4);
  static const Color neutralText = AppColors.white;

  // Refunded / Завершен: dim white.
  static Color dimBg() => AppColors.white.withValues(alpha: 0.06);
  static Color dimBorder() => AppColors.white.withValues(alpha: 0.25);
  static Color dimText() => AppColors.white.withValues(alpha: 0.6);
}

({Color bg, Color border, Color text}) _paymentColors(PaymentStatus s) {
  switch (s) {
    case PaymentStatus.pending:
      return (
        bg: _StatusColors.neutralBg(),
        border: _StatusColors.neutralBorder(),
        text: _StatusColors.neutralText,
      );
    case PaymentStatus.paid:
      return (
        bg: _StatusColors.greenSuccess.withValues(alpha: 0.18),
        border: _StatusColors.greenSuccess,
        text: _StatusColors.greenSuccess,
      );
    case PaymentStatus.unpaid:
      return (
        bg: _StatusColors.orangeWarn.withValues(alpha: 0.18),
        border: _StatusColors.orangeWarn,
        text: AppColors.yellowPrimary,
      );
    case PaymentStatus.refunded:
      return (
        bg: _StatusColors.dimBg(),
        border: _StatusColors.dimBorder(),
        text: _StatusColors.dimText(),
      );
  }
}

({Color bg, Color border, Color text}) _fulfillmentColors(
  FulfillmentStatus s,
) {
  switch (s) {
    case FulfillmentStatus.newOrder:
      return (
        bg: _StatusColors.neutralBg(),
        border: _StatusColors.neutralBorder(),
        text: _StatusColors.neutralText,
      );
    case FulfillmentStatus.active:
      return (
        bg: AppColors.yellowPrimary.withValues(alpha: 0.18),
        border: AppColors.yellowPrimary,
        text: AppColors.yellowPrimary,
      );
    case FulfillmentStatus.completed:
      return (
        bg: _StatusColors.dimBg(),
        border: _StatusColors.dimBorder(),
        text: _StatusColors.dimText(),
      );
    case FulfillmentStatus.cancelled:
      return (
        bg: AppColors.redError.withValues(alpha: 0.15),
        border: AppColors.redError,
        text: AppColors.redError,
      );
  }
}

class PaymentStatusPill extends StatelessWidget {
  final PaymentStatus status;
  final bool showChevron;

  const PaymentStatusPill({
    super.key,
    required this.status,
    this.showChevron = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = _paymentColors(status);
    return _PillFrame(
      bg: c.bg,
      border: c.border,
      text: c.text,
      label: paymentStatusLabel(status),
      showChevron: showChevron,
    );
  }
}

class FulfillmentStatusPill extends StatelessWidget {
  final FulfillmentStatus status;
  final bool showChevron;

  const FulfillmentStatusPill({
    super.key,
    required this.status,
    this.showChevron = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = _fulfillmentColors(status);
    return _PillFrame(
      bg: c.bg,
      border: c.border,
      text: c.text,
      label: fulfillmentStatusLabel(status),
      showChevron: showChevron,
    );
  }
}

class _PillFrame extends StatelessWidget {
  final Color bg;
  final Color border;
  final Color text;
  final String label;
  final bool showChevron;

  const _PillFrame({
    required this.bg,
    required this.border,
    required this.text,
    required this.label,
    required this.showChevron,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(10, 5, showChevron ? 6 : 10, 5),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border, width: 1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                color: text,
                fontSize: 12,
                fontWeight: FontWeight.w500,
                height: 1.2,
                letterSpacing: -0.1,
              ),
            ),
          ),
          if (showChevron) ...[
            const SizedBox(width: 4),
            Icon(Icons.expand_more, color: text, size: 16),
          ],
        ],
      ),
    );
  }
}
