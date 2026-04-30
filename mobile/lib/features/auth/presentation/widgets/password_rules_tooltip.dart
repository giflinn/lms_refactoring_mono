import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';

/// Floating bubble that lists the password rules. Mirrors the Figma design:
/// translucent purple, white text, dismiss button in the corner.
class PasswordRulesTooltip extends StatelessWidget {
  final VoidCallback onClose;

  const PasswordRulesTooltip({super.key, required this.onClose});

  static const _rules = [
    'Мин. 8 символов',
    'Мин. одна заглавная буква',
    'Мин. одна маленькая буква',
    'Мин. одна цифра',
    'Только буквы латинского алфавита',
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 36, 14),
      decoration: BoxDecoration(
        color: AppColors.purplePrimary.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final rule in _rules)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 1),
                  child: Text(
                    rule,
                    style: const TextStyle(
                      color: AppColors.white,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ),
            ],
          ),
          Positioned(
            top: -6,
            right: -24,
            child: IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
              icon: const Icon(Icons.close, color: AppColors.white, size: 18),
              onPressed: onClose,
            ),
          ),
        ],
      ),
    );
  }
}
