import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design/tokens.dart';
import '../../../../core/domain/role.dart';
import '../../../../core/widgets/action_dialog.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/star_rating.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../data/reviews_api.dart';
import '../../data/reviews_api_provider.dart';
import '../../domain/review.dart';
import '../controller/staff_reviews_controller.dart';
import '../widgets/reply_composer_sheet.dart';

/// Staff feed for one client. Lists all of that client's reviews; pending
/// rows get publish/delete buttons, published rows get a delete button.
/// Phase 5 adds the reply composer + delete-reply actions.
class StaffClientReviewsPage extends ConsumerWidget {
  final String clientId;
  const StaffClientReviewsPage({super.key, required this.clientId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(staffClientReviewsProvider(clientId));
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
          leading: IconButton(
            icon: const Icon(
              Icons.chevron_left_rounded,
              color: AppColors.white,
              size: 28,
            ),
            onPressed: () => context.pop(),
          ),
          title: const Text(
            'Отзывы клиента',
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
          error: (_, _) => _ErrorView(
            onRetry: () =>
                ref.invalidate(staffClientReviewsProvider(clientId)),
          ),
          data: (reviews) {
            if (reviews.isEmpty) return const _EmptyView();
            return RefreshIndicator(
              color: AppColors.purplePrimary,
              onRefresh: () async =>
                  ref.invalidate(staffClientReviewsProvider(clientId)),
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: reviews.length,
                separatorBuilder: (_, _) => const SizedBox(height: 16),
                itemBuilder: (_, i) => StaffReviewBlock(
                  review: reviews[i],
                  clientId: clientId,
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Review card + (replies thread) + (action row). Sibling-visible so Phase 5
/// can inject the composer between thread and actions without rewriting the
/// page.
class StaffReviewBlock extends ConsumerWidget {
  final Review review;
  final String clientId;

  const StaffReviewBlock({
    super.key,
    required this.review,
    required this.clientId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authProvider).value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Text(
            review.product.title,
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.7),
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        _ReviewBody(review: review),
        for (final reply in review.replies) ...[
          const SizedBox(height: 8),
          _ReplyCard(
            reply: reply,
            canDelete: me != null && _canDeleteReply(me.role, me.id, reply),
            onDelete: () => _deleteReply(context, ref, reply.id),
          ),
        ],
        _ActionRow(review: review, clientId: clientId),
      ],
    );
  }

  /// senior+admin can delete any reply; manager only their own.
  static bool _canDeleteReply(Role role, String userId, ReviewReply reply) {
    if (role == Role.admin || role == Role.seniorManager) return true;
    if (role == Role.manager) return reply.author.id == userId;
    return false;
  }

  Future<void> _deleteReply(
    BuildContext context,
    WidgetRef ref,
    String replyId,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => ActionDialog(
        icon: const Icon(
          Icons.delete_outline_rounded,
          color: AppColors.white,
          size: 50,
        ),
        title: 'Удалить ответ?',
        primaryLabel: 'Удалить',
        secondaryLabel: 'Отмена',
        secondaryLabelColor: AppColors.white.withValues(alpha: 0.7),
        onPrimary: () => Navigator.of(ctx).pop(true),
        onSecondary: () => Navigator.of(ctx).pop(false),
      ),
    );
    if (confirmed != true) return;
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) return;
    final token = await fbUser.getIdToken();
    if (token == null) return;
    try {
      await ref.read(reviewsApiProvider).deleteReply(
            idToken: token,
            replyId: replyId,
          );
      ref.invalidate(staffClientReviewsProvider(clientId));
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось удалить ответ.')),
      );
    }
  }
}

class _ReviewBody extends StatelessWidget {
  final Review review;
  const _ReviewBody({required this.review});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: StarRating(value: review.rating, size: 16),
              ),
              _StatusPill(status: review.status),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            review.text,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 15,
              height: 1.4,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            formatReviewDateLong(review.createdAt),
            style: TextStyle(
              color: AppColors.white.withValues(alpha: 0.6),
              fontSize: 12,
            ),
          ),
        ],
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
      ReviewStatus.pending => ('На модерации', AppColors.yellowPrimary),
      ReviewStatus.published =>
        ('Опубликован', AppColors.white.withValues(alpha: 0.7)),
      ReviewStatus.deleted => ('Удалён', AppColors.redError),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _ReplyCard extends StatelessWidget {
  final ReviewReply reply;
  final bool canDelete;
  final VoidCallback onDelete;

  const _ReplyCard({
    required this.reply,
    required this.canDelete,
    required this.onDelete,
  });

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
                  size: 32,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    reply.author.fullName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                Text(
                  formatReviewDateLong(reply.createdAt),
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.6),
                    fontSize: 12,
                  ),
                ),
                if (canDelete) ...[
                  const SizedBox(width: 4),
                  InkWell(
                    onTap: onDelete,
                    customBorder: const CircleBorder(),
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Icon(
                        Icons.delete_outline_rounded,
                        color: AppColors.redError.withValues(alpha: 0.8),
                        size: 18,
                      ),
                    ),
                  ),
                ],
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
          ],
        ),
      ),
    );
  }
}

class _ActionRow extends ConsumerStatefulWidget {
  final Review review;
  final String clientId;

  const _ActionRow({required this.review, required this.clientId});

  @override
  ConsumerState<_ActionRow> createState() => _ActionRowState();
}

class _ActionRowState extends ConsumerState<_ActionRow> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final r = widget.review;
    if (r.status == ReviewStatus.deleted) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          if (r.status == ReviewStatus.pending) ...[
            Expanded(
              child: _PrimaryButton(
                label: 'Опубликовать',
                onTap: _busy ? null : () => _moderate(
                      ReviewModerationAction.publish,
                      successMsg: 'Отзыв опубликован.',
                    ),
              ),
            ),
            const SizedBox(width: 12),
          ],
          if (r.status == ReviewStatus.published) ...[
            Expanded(
              child: _PrimaryButton(
                label: 'Ответить',
                onTap: _busy ? null : _openReplyComposer,
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: _DangerButton(
              label: 'Удалить',
              onTap: _busy ? null : _confirmDelete,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openReplyComposer() async {
    final ok = await showReplyComposer(
      context,
      reviewId: widget.review.id,
    );
    if (ok == true) {
      ref.invalidate(staffClientReviewsProvider(widget.clientId));
    }
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => ActionDialog(
        icon: const Icon(
          Icons.delete_outline_rounded,
          color: AppColors.white,
          size: 50,
        ),
        title: 'Удалить отзыв?',
        subtitle: 'Клиент не получит уведомления.',
        primaryLabel: 'Удалить',
        secondaryLabel: 'Отмена',
        secondaryLabelColor: AppColors.white.withValues(alpha: 0.7),
        onPrimary: () => Navigator.of(ctx).pop(true),
        onSecondary: () => Navigator.of(ctx).pop(false),
      ),
    );
    if (confirmed != true) return;
    if (!mounted) return;
    await _moderate(
      ReviewModerationAction.delete,
      successMsg: 'Отзыв удалён.',
    );
  }

  Future<void> _moderate(
    ReviewModerationAction action, {
    required String successMsg,
  }) async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) return;
    final token = await fbUser.getIdToken();
    if (token == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(reviewsApiProvider).moderate(
            idToken: token,
            reviewId: widget.review.id,
            action: action,
          );
      if (!mounted) return;
      ref.invalidate(staffClientReviewsProvider(widget.clientId));
      ref.read(staffPendingReviewsCountProvider.notifier).refresh();
      for (final s in ReviewStatus.values) {
        ref.read(staffReviewsListProvider(s).notifier).refresh();
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successMsg)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось обновить отзыв.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const _PrimaryButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: disabled
                ? null
                : const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      AppColors.yellowGradientTop,
                      AppColors.yellowGradientBottom,
                    ],
                  ),
            color:
                disabled ? AppColors.white.withValues(alpha: 0.1) : null,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: disabled
                  ? AppColors.white.withValues(alpha: 0.4)
                  : AppColors.purpleDark,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.2,
            ),
          ),
        ),
      ),
    );
  }
}

class _DangerButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const _DangerButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(
              color: AppColors.redError.withValues(
                alpha: disabled ? 0.3 : 0.6,
              ),
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            label,
            style: TextStyle(
              color:
                  disabled ? AppColors.redError.withValues(alpha: 0.5) : AppColors.redError,
              fontSize: 14,
              fontWeight: FontWeight.w500,
              letterSpacing: -0.2,
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Text(
          'У клиента пока нет отзывов.',
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

class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorView({required this.onRetry});

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
