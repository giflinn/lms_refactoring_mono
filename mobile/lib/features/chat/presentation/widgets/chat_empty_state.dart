import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';

/// Reusable "Сообщений пока нет..." illustration + caption used by the empty
/// states on both the client chat and staff chat list screens.
class ChatEmptyState extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget? action;

  const ChatEmptyState({
    super.key,
    required this.title,
    required this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppColors.white.withValues(alpha: 0.6),
                  width: 2,
                ),
              ),
              alignment: Alignment.center,
              child: Container(
                width: 64,
                height: 8,
                decoration: BoxDecoration(
                  color: AppColors.white.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(
                color: AppColors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.85),
                fontSize: 13,
                height: 1.4,
              ),
              textAlign: TextAlign.center,
            ),
            if (action != null) ...[
              const SizedBox(height: 16),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
