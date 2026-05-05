import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/notification_item.dart';

class NotificationCard extends StatelessWidget {
  final NotificationItem item;
  const NotificationCard({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.title,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 17,
              fontWeight: FontWeight.w500,
              height: 1.3,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            item.body,
            style: const TextStyle(
              color: AppColors.purpleTertiary,
              fontSize: 15,
              height: 1.34,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            height: 0.5,
            color: AppColors.white.withValues(alpha: 0.2),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                formatNotificationDate(item.sentAt),
                style: TextStyle(
                  color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
                  fontSize: 13,
                  height: 16 / 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                formatNotificationTime(item.sentAt),
                style: TextStyle(
                  color: AppColors.labelSecondaryDark.withValues(alpha: 0.6),
                  fontSize: 13,
                  height: 16 / 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
