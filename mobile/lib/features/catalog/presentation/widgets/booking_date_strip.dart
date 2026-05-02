import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/ru_dates.dart';

/// Horizontal strip of pickable days for the current month. Only days that
/// have at least one available start are shown — passing in an empty list is
/// the caller's job (this widget renders blank in that case). Soft right-edge
/// fade hints at horizontal scrollability for months with many days.
class BookingDateStrip extends StatelessWidget {
  final List<DateTime> daysWithSlots;
  final DateTime? selectedDay;
  final ValueChanged<DateTime> onDayPicked;

  const BookingDateStrip({
    super.key,
    required this.daysWithSlots,
    required this.selectedDay,
    required this.onDayPicked,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 64,
      child: ShaderMask(
        // Soft fade on the right edge as a scroll affordance — the Figma list
        // shows only ~4 days at once and there's no other hint of overflow.
        shaderCallback: (rect) {
          return const LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            stops: [0.0, 0.85, 1.0],
            colors: [Colors.white, Colors.white, Colors.transparent],
          ).createShader(rect);
        },
        blendMode: BlendMode.dstIn,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.only(right: 24),
          itemCount: daysWithSlots.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (ctx, i) {
            final day = daysWithSlots[i];
            final isSelected =
                selectedDay != null && sameDay(day, selectedDay!);
            return _DateCell(
              day: day,
              isSelected: isSelected,
              onTap: () => onDayPicked(day),
            );
          },
        ),
      ),
    );
  }
}

class _DateCell extends StatelessWidget {
  final DateTime day;
  final bool isSelected;
  final VoidCallback onTap;
  const _DateCell({
    required this.day,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bg = isSelected ? AppColors.yellowPrimary : Colors.transparent;
    final border = isSelected
        ? AppColors.yellowPrimary
        : AppColors.purpleTertiary.withValues(alpha: 0.4);
    final text = isSelected ? AppColors.purpleDark : AppColors.white;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 56,
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '${day.day}',
              style: TextStyle(
                color: text,
                fontSize: 17,
                fontWeight: FontWeight.w600,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              weekdayShort(day),
              style: TextStyle(
                color: text,
                fontSize: 12,
                fontWeight: FontWeight.w500,
                height: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
