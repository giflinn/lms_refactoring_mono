import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/star_rating.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../domain/review.dart';

/// Compact list row for the staff "Отзывы" tab. Shows the client + product +
/// rating + a snippet of the review text. Whole tile is tappable; the page
/// pushes the per-client feed (filtered to that clientId) on tap.
class StaffReviewListTile extends StatelessWidget {
  final Review review;
  final VoidCallback onTap;
  final bool showStatus;

  const StaffReviewListTile({
    super.key,
    required this.review,
    required this.onTap,
    this.showStatus = false,
  });

  @override
  Widget build(BuildContext context) {
    final clientName = review.client.fullName.isEmpty
        ? 'Аноним'
        : review.client.fullName;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              UserAvatar(
                avatarUrl: review.client.avatarUrl,
                firstName: review.client.firstName,
                lastName: review.client.lastName,
                size: 44,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            clientName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                              height: 1.3,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        StarRating(value: review.rating, size: 14),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      review.product.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppColors.white.withValues(alpha: 0.6),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      review.text,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.white,
                        fontSize: 14,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          formatReviewDateShort(review.createdAt),
                          style: TextStyle(
                            color: AppColors.white.withValues(alpha: 0.5),
                            fontSize: 12,
                          ),
                        ),
                        if (showStatus) ...[
                          const Spacer(),
                          _StatusPill(status: review.status),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.chevron_right_rounded,
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

class _StatusPill extends StatelessWidget {
  final ReviewStatus status;
  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      ReviewStatus.pending => ('В обработке', AppColors.yellowPrimary),
      ReviewStatus.published => (
          'Опубликован',
          AppColors.white.withValues(alpha: 0.7),
        ),
      ReviewStatus.deleted => ('Удалён', AppColors.redError),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w500,
          letterSpacing: -0.2,
        ),
      ),
    );
  }
}
