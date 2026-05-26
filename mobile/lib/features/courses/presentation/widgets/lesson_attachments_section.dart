import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/course.dart';

/// "Материалы" — list of PDF attachments rendered under the lesson HTML body.
/// Each row opens the [ProtectedPdfViewerPage] when tapped. Visual style
/// matches the lesson card chrome so it reads as part of the same block.
class LessonAttachmentsSection extends StatelessWidget {
  final List<LessonAttachment> attachments;
  final void Function(LessonAttachment) onTap;

  const LessonAttachmentsSection({
    super.key,
    required this.attachments,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (attachments.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 20),
        const Text(
          'Материалы',
          style: TextStyle(
            color: AppColors.greyDark,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 10),
        for (final a in attachments) ...[
          _AttachmentRow(attachment: a, onTap: () => onTap(a)),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _AttachmentRow extends StatelessWidget {
  final LessonAttachment attachment;
  final VoidCallback onTap;

  const _AttachmentRow({required this.attachment, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.purplePrimary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppColors.purplePrimary.withValues(alpha: 0.18),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.purplePrimary,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: const Text(
                  'PDF',
                  style: TextStyle(
                    color: AppColors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      attachment.fileName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.greyDark,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _formatBytes(attachment.sizeBytes),
                      style: const TextStyle(
                        color: AppColors.greyMedium,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right,
                color: AppColors.greyMedium,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes Б';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} КБ';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} МБ';
  }
}
