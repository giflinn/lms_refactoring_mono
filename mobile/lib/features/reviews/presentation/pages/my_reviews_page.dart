import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/action_dialog.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../domain/leave_review_args.dart';
import '../../domain/review.dart';
import '../controller/my_reviews_controller.dart';
import '../widgets/review_kebab_menu.dart';

/// "Мои отзывы" — flat list of the calling client's reviews. Pending entries
/// get a kebab menu (edit / delete); published ones are read-only and show
/// the staff reply (if any) inline beneath the card.
class MyReviewsPage extends ConsumerWidget {
  const MyReviewsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myReviewsProvider);
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(Icons.chevron_left_rounded,
                color: AppColors.white, size: 28),
            onPressed: () => context.pop(),
          ),
          title: const Text(
            'Мои отзывы',
            style: TextStyle(
              color: AppColors.white,
              fontSize: 17,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.4,
            ),
          ),
        ),
        body: async.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.white),
          ),
          error: (_, _) => _ErrorState(
            onRetry: () => ref.read(myReviewsProvider.notifier).refresh(),
          ),
          data: (reviews) {
            if (reviews.isEmpty) return const _EmptyState();
            return RefreshIndicator(
              color: AppColors.purplePrimary,
              onRefresh: () =>
                  ref.read(myReviewsProvider.notifier).refresh(),
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: reviews.length,
                separatorBuilder: (_, _) => const SizedBox(height: 16),
                itemBuilder: (_, i) => _ReviewSection(review: reviews[i]),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Text(
          'У вас пока нет отзывов.\nЗавершите заказ, чтобы оставить первый.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AppColors.white.withValues(alpha: 0.7),
            fontSize: 15,
            height: 1.4,
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorState({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Не удалось загрузить отзывы.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.8),
                fontSize: 15,
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: onRetry,
              child: const Text(
                'Повторить',
                style: TextStyle(color: AppColors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewSection extends ConsumerWidget {
  final Review review;
  const _ReviewSection({required this.review});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Text(
            review.product.title,
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.85),
              fontSize: 14,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.2,
            ),
          ),
        ),
        _ReviewCard(review: review),
        for (final reply in review.replies) ...[
          const SizedBox(height: 8),
          _ReplyCard(reply: reply),
        ],
      ],
    );
  }
}

class _ReviewCard extends ConsumerWidget {
  final Review review;
  const _ReviewCard({required this.review});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPending = review.status == ReviewStatus.pending;
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 6, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 8, top: 2),
                  child: Text(
                    review.text,
                    style: const TextStyle(
                      color: AppColors.white,
                      fontSize: 15,
                      height: 1.4,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
              ),
              if (isPending)
                _KebabButton(
                  onTap: () => _showMenu(context, ref, review),
                )
              else
                const SizedBox(width: 36),
            ],
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Container(
              height: 0.5,
              color: AppColors.white.withValues(alpha: 0.18),
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Row(
              children: [
                Text(
                  formatReviewDateShort(review.createdAt),
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.6),
                    fontSize: 13,
                  ),
                ),
                const Spacer(),
                _StatusLabel(status: review.status),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showMenu(
    BuildContext context,
    WidgetRef ref,
    Review review,
  ) async {
    final action = await showReviewKebabMenu(context);
    if (action == null) return;
    if (!context.mounted) return;
    switch (action) {
      case ReviewKebabAction.edit:
        context.push(
          '/client/reviews/leave',
          extra: LeaveReviewArgs(
            productId: review.product.id,
            productTitle: review.product.title,
            reviewId: review.id,
            initialRating: review.rating,
            initialText: review.text,
          ),
        );
        return;
      case ReviewKebabAction.delete:
        final confirmed = await _confirmDelete(context);
        if (confirmed != true) return;
        if (!context.mounted) return;
        try {
          await ref.read(myReviewsProvider.notifier).deleteOne(review.id);
        } catch (_) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Не удалось удалить отзыв.')),
            );
          }
        }
        return;
    }
  }

  Future<bool?> _confirmDelete(BuildContext context) {
    return showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => ActionDialog(
        icon: const Icon(
          Icons.delete_outline_rounded,
          color: AppColors.white,
          size: 50,
        ),
        title: 'Удалить отзыв?',
        subtitle: 'Действие нельзя отменить.',
        primaryLabel: 'Удалить',
        secondaryLabel: 'Отмена',
        secondaryLabelColor: AppColors.white.withValues(alpha: 0.7),
        onPrimary: () => Navigator.of(ctx).pop(true),
        onSecondary: () => Navigator.of(ctx).pop(false),
      ),
    );
  }
}

class _KebabButton extends StatelessWidget {
  final VoidCallback onTap;
  const _KebabButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: const Padding(
        padding: EdgeInsets.all(6),
        child: Icon(
          Icons.more_horiz_rounded,
          color: AppColors.white,
          size: 24,
        ),
      ),
    );
  }
}

class _StatusLabel extends StatelessWidget {
  final ReviewStatus status;
  const _StatusLabel({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      ReviewStatus.pending => ('В обработке', AppColors.yellowPrimary),
      ReviewStatus.published =>
        ('Опубликован', AppColors.white.withValues(alpha: 0.6)),
      ReviewStatus.deleted =>
        ('Удалён', AppColors.redError),
    };
    return Text(
      label,
      style: TextStyle(
        color: color,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
    );
  }
}

class _ReplyCard extends StatelessWidget {
  final ReviewReply reply;
  const _ReplyCard({required this.reply});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 24),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                UserAvatar(
                  avatarUrl: reply.author.avatarUrl,
                  firstName: reply.author.firstName,
                  lastName: reply.author.lastName,
                  size: 36,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    reply.author.fullName,
                    style: const TextStyle(
                      color: AppColors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              reply.text,
              style: const TextStyle(
                color: AppColors.white,
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              height: 0.5,
              color: AppColors.white.withValues(alpha: 0.15),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Text(
                  formatReviewDateLong(reply.createdAt),
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.6),
                    fontSize: 12,
                  ),
                ),
                const Spacer(),
                Text(
                  formatReviewTime(reply.createdAt),
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.6),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
