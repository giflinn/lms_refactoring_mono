import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/cancellation.dart';

/// Result of [showDecideCancellationDialog]. `null` means the user backed
/// out without deciding; otherwise [decision] is approved/rejected and
/// [comment] is the optional decisionComment they typed (trimmed).
class DecideCancellationResult {
  final CancellationStatus decision;
  final String? comment;

  const DecideCancellationResult({
    required this.decision,
    required this.comment,
  });
}

/// Modal that captures the staff decision on a cancellation request.
/// Mirrors Figma `64:46093`: textarea for an optional comment + two CTAs
/// (yellow "Подтвердить отмену", red text "Отказать в отмене"). Used both
/// when approving and when rejecting — the buttons live side by side so
/// the staff doesn't need to pre-pick a path before typing.
Future<DecideCancellationResult?> showDecideCancellationDialog(
  BuildContext context,
) async {
  return showDialog<DecideCancellationResult>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (_) => const _DecideDialog(),
  );
}

class _DecideDialog extends StatefulWidget {
  const _DecideDialog();

  @override
  State<_DecideDialog> createState() => _DecideDialogState();
}

class _DecideDialogState extends State<_DecideDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _pop(CancellationStatus decision) {
    final raw = _controller.text.trim();
    Navigator.of(context).pop(
      DecideCancellationResult(
        decision: decision,
        comment: raw.isEmpty ? null : raw,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 12),
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
            const _CartIcon(),
            const SizedBox(height: 16),
            const Text(
              'Изменение статуса заказа',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white,
                fontSize: 17,
                fontWeight: FontWeight.w500,
                height: 1.3,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Опишите причину отмены или подтверждения заказа',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.white.withValues(alpha: 0.7),
                fontSize: 14,
                fontWeight: FontWeight.w500,
                height: 1.34,
                letterSpacing: -0.4,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              decoration: BoxDecoration(
                color: AppColors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: TextField(
                controller: _controller,
                maxLines: 4,
                minLines: 4,
                maxLength: 1000,
                cursorColor: AppColors.white,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  height: 1.34,
                  letterSpacing: -0.4,
                ),
                decoration: InputDecoration(
                  hintText: 'Комментарий (необязательно)',
                  hintStyle: TextStyle(
                    color: AppColors.white.withValues(alpha: 0.5),
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                  border: InputBorder.none,
                  counterText: '',
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            _PrimaryButton(
              label: 'Подтвердить отмену',
              onTap: () => _pop(CancellationStatus.approved),
            ),
            const SizedBox(height: 4),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: () => _pop(CancellationStatus.rejected),
                child: const Text(
                  'Отказать в отмене',
                  style: TextStyle(
                    color: AppColors.redError,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
            ),
            SizedBox(
              width: double.infinity,
              height: 40,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(
                  'Закрыть',
                  style: TextStyle(
                    color: AppColors.purpleTertiary.withValues(alpha: 0.8),
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
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

class _PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _PrimaryButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        height: 54,
        width: double.infinity,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.yellowGradientTop,
              AppColors.yellowGradientBottom,
            ],
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: AppColors.purpleDark,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.4,
          ),
        ),
      ),
    );
  }
}

/// Tiny shopping-cart icon at the top of the dialog. Drawn in code to match
/// the rest of the app's icon set (white outline, ~2px stroke).
class _CartIcon extends StatelessWidget {
  const _CartIcon();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(50, 50),
      painter: _CartPainter(),
    );
  }
}

class _CartPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = AppColors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final w = size.width;
    final h = size.height;

    canvas.drawLine(Offset(w * 0.10, h * 0.20),
        Offset(w * 0.22, h * 0.20), stroke);
    canvas.drawLine(Offset(w * 0.22, h * 0.20),
        Offset(w * 0.32, h * 0.62), stroke);

    final body = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.26, h * 0.30, w * 0.58, h * 0.32),
      const Radius.circular(4),
    );
    canvas.drawRRect(body, stroke);

    canvas.drawCircle(Offset(w * 0.40, h * 0.78), w * 0.05, stroke);
    canvas.drawCircle(Offset(w * 0.70, h * 0.78), w * 0.05, stroke);
  }

  @override
  bool shouldRepaint(_CartPainter oldDelegate) => false;
}
