import 'package:flutter/material.dart';
import '../design/tokens.dart';
import 'primary_button.dart';

/// Two-button confirmation dialog with the brand purple gradient backdrop,
/// a 50×50 illustration on top, centered title, optional subtitle, a yellow
/// primary CTA, and a text-style secondary action. Reused across cart prompts
/// (add/remove/replace/full) and the cabinet logout confirm.
class ActionDialog extends StatelessWidget {
  /// Top illustration. Caller renders to ~50×50 with the desired tint.
  final Widget icon;
  final String title;
  final String? subtitle;
  final String primaryLabel;
  final String secondaryLabel;
  final VoidCallback onPrimary;
  final VoidCallback onSecondary;
  final Color secondaryLabelColor;

  const ActionDialog({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    required this.primaryLabel,
    required this.secondaryLabel,
    required this.onPrimary,
    required this.onSecondary,
    this.secondaryLabelColor = AppColors.white,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppColors.purpleGradientTop, AppColors.purplePrimary],
          ),
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            icon,
            const SizedBox(height: 24),
            SizedBox(
              width: 252,
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: 252,
                child: Text(
                  subtitle!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.6),
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    height: 1.34,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
            PrimaryButton(label: primaryLabel, onPressed: onPrimary),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: onSecondary,
                child: Text(
                  secondaryLabel,
                  style: TextStyle(
                    color: secondaryLabelColor,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
