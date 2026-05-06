import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';

enum ReviewKebabAction { edit, delete }

/// "Редактировать / Удалить" mini-popover triggered by tapping the kebab on
/// a pending review. Implemented as a bottom sheet (project convention)
/// rather than the Figma fly-out — same content, more idiomatic on phones.
Future<ReviewKebabAction?> showReviewKebabMenu(BuildContext context) {
  return showModalBottomSheet<ReviewKebabAction>(
    context: context,
    backgroundColor: AppColors.purpleDark,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(0, 12, 0, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.white.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _MenuTile(
                icon: Icons.edit_outlined,
                label: 'Редактировать',
                color: AppColors.white,
                onTap: () =>
                    Navigator.of(ctx).pop(ReviewKebabAction.edit),
              ),
              _MenuTile(
                icon: Icons.delete_outline_rounded,
                label: 'Удалить',
                color: AppColors.redError,
                onTap: () =>
                    Navigator.of(ctx).pop(ReviewKebabAction.delete),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _MenuTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 14),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 16,
                fontWeight: FontWeight.w500,
                letterSpacing: -0.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
