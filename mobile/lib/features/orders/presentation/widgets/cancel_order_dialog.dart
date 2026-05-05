import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/primary_button.dart';

/// Confirmation dialog shown when the client taps "Отменить заказ" on an
/// active purchase. Visually mirrors [ActionDialog] but is a dedicated
/// stateful widget because it captures an optional reason. Returns the
/// trimmed reason on confirm (may be empty), or `null` if the user backed
/// out. Backend trims/clamps to 500 chars.
Future<String?> showCancelOrderDialog(BuildContext context) async {
  return showDialog<String?>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (_) => const _CancelOrderDialog(),
  );
}

class _CancelOrderDialog extends StatefulWidget {
  const _CancelOrderDialog();

  @override
  State<_CancelOrderDialog> createState() => _CancelOrderDialogState();
}

class _CancelOrderDialogState extends State<_CancelOrderDialog> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

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
            const _CartCrossIcon(),
            const SizedBox(height: 24),
            const SizedBox(
              width: 252,
              child: Text(
                'Вы уверены что хотите отменить заказ?',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: 252,
              child: Text(
                'Заказ будет отменен после подтверждения менеджера.',
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
            const SizedBox(height: 16),
            Container(
              decoration: BoxDecoration(
                color: AppColors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: TextField(
                controller: _controller,
                maxLines: 3,
                minLines: 3,
                maxLength: 500,
                cursorColor: AppColors.white,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  height: 1.34,
                  letterSpacing: -0.4,
                ),
                decoration: InputDecoration(
                  hintText: 'Причина (необязательно)',
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
            const SizedBox(height: 24),
            PrimaryButton(
              label: 'Подтвердить',
              onPressed: () => Navigator.of(context).pop(_controller.text),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(null),
                child: const Text(
                  'Отмена',
                  style: TextStyle(
                    color: AppColors.purpleTertiary,
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

/// Cart-with-cross illustration. Drawn in code to avoid shipping a one-off
/// asset; matches the linear-icon style used elsewhere (white stroke ~2px,
/// rounded line ends).
class _CartCrossIcon extends StatelessWidget {
  const _CartCrossIcon();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(50, 50),
      painter: _CartCrossPainter(),
    );
  }
}

class _CartCrossPainter extends CustomPainter {
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

    // Handle line going up-left from the cart top-left corner.
    canvas.drawLine(
      Offset(w * 0.10, h * 0.20),
      Offset(w * 0.22, h * 0.20),
      stroke,
    );
    canvas.drawLine(
      Offset(w * 0.22, h * 0.20),
      Offset(w * 0.32, h * 0.62),
      stroke,
    );

    // Cart body — rounded rectangle.
    final bodyRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(w * 0.26, h * 0.30, w * 0.58, h * 0.32),
      const Radius.circular(4),
    );
    canvas.drawRRect(bodyRect, stroke);

    // Wheels.
    canvas.drawCircle(Offset(w * 0.40, h * 0.78), w * 0.05, stroke);
    canvas.drawCircle(Offset(w * 0.70, h * 0.78), w * 0.05, stroke);

    // X inside the cart.
    canvas.drawLine(
      Offset(w * 0.42, h * 0.40),
      Offset(w * 0.66, h * 0.54),
      stroke,
    );
    canvas.drawLine(
      Offset(w * 0.66, h * 0.40),
      Offset(w * 0.42, h * 0.54),
      stroke,
    );
  }

  @override
  bool shouldRepaint(_CartCrossPainter oldDelegate) => false;
}
