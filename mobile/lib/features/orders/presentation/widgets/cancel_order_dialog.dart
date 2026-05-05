import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/action_dialog.dart';

/// Confirmation dialog shown when the client taps "Отменить заказ" on an
/// active purchase. Confirm is currently a stub — see [MyPurchasesPage].
Future<bool> showCancelOrderDialog(BuildContext context) async {
  final confirmed = await showDialog<bool>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.4),
    builder: (ctx) => ActionDialog(
      icon: const _CartCrossIcon(),
      title: 'Вы уверены что хотите отменить заказ?',
      subtitle: 'Заказ будет отменен после подтверждения менеджера.',
      primaryLabel: 'Подтвердить',
      secondaryLabel: 'Отмена',
      secondaryLabelColor: AppColors.purpleTertiary,
      onPrimary: () => Navigator.of(ctx).pop(true),
      onSecondary: () => Navigator.of(ctx).pop(false),
    ),
  );
  return confirmed ?? false;
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
