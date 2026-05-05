import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/staff_order.dart';

/// Generic bottom sheet for picking a new status. Closing on tap returns
/// `null`; tapping a non-current option returns the selection. The caller
/// is expected to skip the patch when the user picked the current value
/// (we still surface it in the list so the sheet always shows the full
/// vocabulary, like the admin web menu).
Future<T?> showStatusChangeSheet<T>({
  required BuildContext context,
  required String title,
  required T current,
  required List<({T value, String label})> options,
}) {
  return showModalBottomSheet<T>(
    context: context,
    backgroundColor: AppColors.purpleDark,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.white.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              for (final opt in options) ...[
                _OptionTile(
                  label: opt.label,
                  selected: opt.value == current,
                  onTap: () => Navigator.of(ctx).pop(opt.value),
                ),
              ],
            ],
          ),
        ),
      );
    },
  );
}

class _OptionTile extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _OptionTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            if (selected)
              const Icon(
                Icons.check,
                color: AppColors.yellowPrimary,
                size: 22,
              ),
          ],
        ),
      ),
    );
  }
}

List<({PaymentStatus value, String label})> paymentStatusOptions() => [
      for (final s in PaymentStatus.values)
        (value: s, label: paymentStatusLabel(s)),
    ];

List<({FulfillmentStatus value, String label})> fulfillmentStatusOptions() =>
    [
      for (final s in FulfillmentStatus.values)
        (value: s, label: fulfillmentStatusLabel(s)),
    ];
