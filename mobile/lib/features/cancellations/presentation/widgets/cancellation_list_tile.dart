import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../orders/domain/order.dart' show formatOrderDate;
import '../../domain/cancellation.dart';
import 'cancellation_status_pill.dart';

/// Compact list row matching the Figma "Avatar + ФИО + дата + №" layout.
/// Whole tile is tappable — opens the detail screen.
class CancellationListTile extends StatelessWidget {
  final StaffCancellation row;
  final VoidCallback onTap;

  const CancellationListTile({
    super.key,
    required this.row,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final clientName = row.client.fullName.isEmpty
        ? row.client.email
        : row.client.fullName;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              UserAvatar(
                avatarUrl: row.client.avatarUrl,
                firstName: row.client.firstName,
                lastName: row.client.lastName,
                size: 48,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      clientName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        height: 1.3,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _formatShortDate(row.createdAt),
                      style: TextStyle(
                        color: AppColors.white.withValues(alpha: 0.6),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        height: 1.3,
                        letterSpacing: -0.2,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '№ ${row.orderNumber}',
                    style: TextStyle(
                      color: AppColors.white.withValues(alpha: 0.7),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      letterSpacing: -0.2,
                    ),
                  ),
                  // Show the status pill only on the decided tabs — the
                  // requested tab is homogeneous so the pill is noise.
                  if (row.status != CancellationStatus.requested) ...[
                    const SizedBox(height: 4),
                    CancellationStatusPill(status: row.status),
                  ],
                ],
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right,
                color: AppColors.white.withValues(alpha: 0.6),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "13.03.2024" — short numeric form per Figma list. We keep the longer
/// `formatOrderDate` for the detail screen where it reads better.
String _formatShortDate(DateTime d) {
  final local = d.toLocal();
  final dd = local.day.toString().padLeft(2, '0');
  final mm = local.month.toString().padLeft(2, '0');
  return '$dd.$mm.${local.year}';
}

/// "12 марта" — section label between groups of rows. Days-of-month
/// without the year (the year is implicit from being inside the same list).
String formatDayMonthHeader(DateTime d) {
  final local = d.toLocal();
  return '${local.day} ${_ruMonthsGenitive[local.month - 1]}';
}

const _ruMonthsGenitive = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

// `formatOrderDate` is re-exported so the detail screen can `import` the
// same helper without cross-feature pulls. Keeps the detail page closer to
// `cancellation_list_tile.dart` than to `orders/domain/order.dart`.
String formatLongDate(DateTime d) => formatOrderDate(d);
