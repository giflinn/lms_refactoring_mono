import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/ru_dates.dart';

/// Yellow pill on the booking section's header. Tapping opens a bottom sheet
/// with 24 months starting from the current one — enough for any reasonable
/// booking horizon without an infinite list.
class BookingMonthPicker extends StatelessWidget {
  final DateTime selectedMonth;
  final ValueChanged<DateTime> onPicked;
  const BookingMonthPicker({
    super.key,
    required this.selectedMonth,
    required this.onPicked,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => _showSheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.yellowPrimary,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              monthLabel(selectedMonth, withYear: true),
              style: const TextStyle(
                color: AppColors.purpleDark,
                fontSize: 14,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 18,
              color: AppColors.purpleDark,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showSheet(BuildContext context) async {
    final now = DateTime.now();
    final months = List<DateTime>.generate(
      24,
      (i) => DateTime(now.year, now.month + i, 1),
    );
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: AppColors.purpleGradientBottom,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _MonthPickerSheet(
        months: months,
        selected: selectedMonth,
      ),
    );
    if (picked != null) onPicked(picked);
  }
}

class _MonthPickerSheet extends StatelessWidget {
  final List<DateTime> months;
  final DateTime selected;
  const _MonthPickerSheet({required this.months, required this.selected});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.6,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.white.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 8),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Месяц',
                style: TextStyle(
                  color: AppColors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: months.length,
                itemBuilder: (ctx, i) {
                  final m = months[i];
                  final isSelected = m.year == selected.year &&
                      m.month == selected.month;
                  return InkWell(
                    onTap: () => Navigator.of(ctx).pop(m),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 14,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              monthLabel(m, withYear: true),
                              style: TextStyle(
                                color: isSelected
                                    ? AppColors.yellowPrimary
                                    : AppColors.white,
                                fontSize: 16,
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.w400,
                              ),
                            ),
                          ),
                          if (isSelected)
                            const Icon(
                              Icons.check_rounded,
                              color: AppColors.yellowPrimary,
                              size: 22,
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
