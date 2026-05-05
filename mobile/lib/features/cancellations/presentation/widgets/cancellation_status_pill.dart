import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/cancellation.dart';

/// Status pill for cancellations. Shape mirrors the orders status pills —
/// 1px border, status-tinted bg, rounded 8 — so the two surfaces feel like
/// the same family. Hardcoded colors tuned for the app's purple gradient.
class CancellationStatusPill extends StatelessWidget {
  final CancellationStatus status;
  final bool large;

  const CancellationStatusPill({
    super.key,
    required this.status,
    this.large = false,
  });

  @override
  Widget build(BuildContext context) {
    final c = _colors(status);
    return Container(
      padding: large
          ? const EdgeInsets.symmetric(horizontal: 12, vertical: 7)
          : const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: c.bg,
        border: Border.all(color: c.border, width: 1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        cancellationStatusLabel(status),
        style: TextStyle(
          color: c.text,
          fontSize: large ? 14 : 12,
          fontWeight: FontWeight.w500,
          height: 1.2,
          letterSpacing: -0.1,
        ),
      ),
    );
  }
}

({Color bg, Color border, Color text}) _colors(CancellationStatus s) {
  const orange = Color(0xFFFA8905);
  const green = Color(0xFF34C759);
  switch (s) {
    case CancellationStatus.requested:
      return (
        bg: orange.withValues(alpha: 0.18),
        border: orange,
        text: AppColors.yellowPrimary,
      );
    case CancellationStatus.approved:
      return (
        bg: green.withValues(alpha: 0.18),
        border: green,
        text: green,
      );
    case CancellationStatus.rejected:
      return (
        bg: AppColors.redError.withValues(alpha: 0.15),
        border: AppColors.redError,
        text: AppColors.redError,
      );
  }
}
