import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/product.dart';
import '../controller/available_starts_controller.dart';
import 'booking_date_strip.dart';
import 'booking_month_picker.dart';
import 'booking_time_strip.dart';

/// Booking section for bookable products on the detail page. Composition:
///   "Выберите дату" + month-pill (yellow, opens bottom-sheet picker)
///   horizontal date strip (only days that have starts; soft fade right edge)
///   "Выберите время" + time pills (only after a date is picked)
///
/// Selection state lives on the parent so the action bar can react to the
/// same state without prop-drilling another controller.
class ProductBookingSection extends ConsumerWidget {
  final Product product;
  final DateTime selectedMonth;
  final DateTime? selectedDay;
  final AvailableStart? selectedStart;
  final ValueChanged<DateTime> onMonthPicked;
  final ValueChanged<DateTime> onDayPicked;
  final ValueChanged<AvailableStart> onStartPicked;

  const ProductBookingSection({
    super.key,
    required this.product,
    required this.selectedMonth,
    required this.selectedDay,
    required this.selectedStart,
    required this.onMonthPicked,
    required this.onDayPicked,
    required this.onStartPicked,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final args = AvailableStartsArgs(
      productId: product.id,
      monthStart: selectedMonth,
    );
    final asyncStarts = ref.watch(availableStartsProvider(args));

    return asyncStarts.when(
      data: (starts) => _Loaded(
        starts: starts,
        selectedMonth: selectedMonth,
        selectedDay: selectedDay,
        selectedStart: selectedStart,
        onMonthPicked: onMonthPicked,
        onDayPicked: onDayPicked,
        onStartPicked: onStartPicked,
      ),
      loading: () => const _Loading(),
      error: (_, _) => _Error(
        onRetry: () => ref.invalidate(availableStartsProvider(args)),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 24),
      child: Center(
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.white,
          ),
        ),
      ),
    );
  }
}

class _Error extends StatelessWidget {
  final VoidCallback onRetry;
  const _Error({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Не удалось загрузить доступные слоты.',
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.85),
                fontSize: 14,
              ),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: AppColors.yellowGradientTop,
            ),
            child: const Text('Повторить'),
          ),
        ],
      ),
    );
  }
}

class _Loaded extends StatelessWidget {
  final List<AvailableStart> starts;
  final DateTime selectedMonth;
  final DateTime? selectedDay;
  final AvailableStart? selectedStart;
  final ValueChanged<DateTime> onMonthPicked;
  final ValueChanged<DateTime> onDayPicked;
  final ValueChanged<AvailableStart> onStartPicked;

  const _Loaded({
    required this.starts,
    required this.selectedMonth,
    required this.selectedDay,
    required this.selectedStart,
    required this.onMonthPicked,
    required this.onDayPicked,
    required this.onStartPicked,
  });

  @override
  Widget build(BuildContext context) {
    final byDay = _groupStartsByLocalDay(starts);
    final daysWithSlots = byDay.keys.toList()
      ..sort((a, b) => a.compareTo(b));
    final monthHasNoStarts = daysWithSlots.isEmpty;

    final selectedKey = selectedDay == null
        ? null
        : DateTime(selectedDay!.year, selectedDay!.month, selectedDay!.day);
    final timeOptions = selectedKey == null
        ? const <AvailableStart>[]
        : (byDay[selectedKey] ?? const <AvailableStart>[]);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Выберите дату',
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
                letterSpacing: -0.4,
              ),
            ),
            BookingMonthPicker(
              selectedMonth: selectedMonth,
              onPicked: onMonthPicked,
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (monthHasNoStarts)
          const _EmptyMessage(
            text: 'На данный момент нет свободных дат в этом месяце.',
          )
        else
          BookingDateStrip(
            daysWithSlots: daysWithSlots,
            selectedDay: selectedDay,
            onDayPicked: onDayPicked,
          ),
        // Time section: only render once a date is picked. Per the Figma spec
        // this hides the time section in "no dates" / "month empty" / "no
        // selection yet" states (avoids the duplicated "нет слотов" message
        // the junior designer drew).
        if (selectedDay != null) ...[
          const SizedBox(height: 16),
          const Text(
            'Выберите время',
            style: TextStyle(
              color: AppColors.white,
              fontSize: 17,
              fontWeight: FontWeight.w500,
              height: 1.3,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 12),
          if (timeOptions.isEmpty)
            const _EmptyMessage(
              text: 'На этот день свободного времени нет.',
            )
          else
            BookingTimeStrip(
              options: timeOptions,
              selectedStart: selectedStart,
              onStartPicked: onStartPicked,
            ),
        ],
      ],
    );
  }
}

class _EmptyMessage extends StatelessWidget {
  final String text;
  const _EmptyMessage({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: AppColors.purpleTertiary,
          fontSize: 14,
          fontWeight: FontWeight.w500,
          height: 1.3,
        ),
      ),
    );
  }
}

Map<DateTime, List<AvailableStart>> _groupStartsByLocalDay(
  List<AvailableStart> starts,
) {
  // Keyed by local midnight so equality is on calendar-day, not instant.
  final out = <DateTime, List<AvailableStart>>{};
  for (final s in starts) {
    final local = s.startsAt.toLocal();
    final key = DateTime(local.year, local.month, local.day);
    (out[key] ??= []).add(s);
  }
  return out;
}
