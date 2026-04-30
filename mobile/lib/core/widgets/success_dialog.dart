import 'package:flutter/material.dart';
import '../design/tokens.dart';
import 'primary_button.dart';

/// Centered modal dialog matching the Figma success states (account ready,
/// password changed). Round purple card with an icon, title, message, and an
/// orange "Ок" button.
class SuccessDialog extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String buttonLabel;
  final VoidCallback? onPressed;

  const SuccessDialog({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.buttonLabel = 'Ок',
    this.onPressed,
  });

  static Future<void> show(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String message,
    String buttonLabel = 'Ок',
  }) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.4),
      builder: (ctx) => SuccessDialog(
        icon: icon,
        title: title,
        message: message,
        buttonLabel: buttonLabel,
        onPressed: () => Navigator.pop(ctx),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 32),
      child: Container(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.purpleGradientTop,
              AppColors.purpleDark,
            ],
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.white, width: 1.5),
              ),
              child: Icon(icon, color: AppColors.white, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.85),
                fontSize: 14,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 20),
            PrimaryButton(label: buttonLabel, onPressed: onPressed),
          ],
        ),
      ),
    );
  }
}
