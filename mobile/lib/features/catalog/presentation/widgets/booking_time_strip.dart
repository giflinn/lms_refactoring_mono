import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/product.dart';
import '../../domain/ru_dates.dart';

/// Wrappable grid of time pills representing the bookable starts inside the
/// currently-picked day. Server already sliced each block into product-
/// duration windows, so each pill is a self-contained selection — picking
/// one is what enables the action bar.
class BookingTimeStrip extends StatelessWidget {
  final List<AvailableStart> options;
  final AvailableStart? selectedStart;
  final ValueChanged<AvailableStart> onStartPicked;

  const BookingTimeStrip({
    super.key,
    required this.options,
    required this.selectedStart,
    required this.onStartPicked,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final s in options)
          _TimePill(
            start: s,
            isSelected: selectedStart != null &&
                selectedStart!.startsAt.isAtSameMomentAs(s.startsAt),
            onTap: () => onStartPicked(s),
          ),
      ],
    );
  }
}

class _TimePill extends StatelessWidget {
  final AvailableStart start;
  final bool isSelected;
  final VoidCallback onTap;
  const _TimePill({
    required this.start,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final localStart = start.startsAt.toLocal();
    final localEnd = start.endsAt.toLocal();
    final bg = isSelected ? AppColors.yellowPrimary : Colors.transparent;
    final border = isSelected
        ? AppColors.yellowPrimary
        : AppColors.purpleTertiary.withValues(alpha: 0.4);
    final text = isSelected ? AppColors.purpleDark : AppColors.white;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border),
        ),
        child: Text(
          '${hhmm(localStart)} – ${hhmm(localEnd)}',
          style: TextStyle(
            color: text,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
