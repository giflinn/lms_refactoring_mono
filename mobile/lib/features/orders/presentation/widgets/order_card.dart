import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/order.dart';

/// Coupon-style order card with a paper-tear bottom edge. Header rows are
/// fixed (№ заказа / Дата / Менеджер); below the divider come Товаров (a
/// list of product titles) + Сумма; the optional [actions] slot renders
/// inline buttons inside the card (Активные tab CTAs).
class OrderCard extends StatelessWidget {
  final ClientOrder order;
  final Widget? actions;

  const OrderCard({super.key, required this.order, this.actions});

  @override
  Widget build(BuildContext context) {
    final managerName = order.manager?.fullName ?? '—';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            color: AppColors.white.withValues(alpha: 0.1),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
          ),
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Row(label: '№ заказа', value: order.orderNumber.toString()),
              const SizedBox(height: 12),
              _Row(label: 'Дата', value: formatOrderDate(order.createdAt)),
              const SizedBox(height: 12),
              _Row(label: 'Менеджер', value: managerName),
              const SizedBox(height: 12),
              const _DashedDivider(),
              const SizedBox(height: 12),
              _ProductsRow(titles: order.productTitles),
              const SizedBox(height: 12),
              _SumRow(value: order.totalTenge),
              if (actions != null) ...[
                const SizedBox(height: 16),
                actions!,
              ],
            ],
          ),
        ),
        // Paper-tear: row of small semicircles cut into the bottom of the
        // card. Matches the coupon look in Figma without an asset.
        const _PaperTear(),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;

  const _Row({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: AppColors.purpleTertiary,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.4,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 15,
              fontWeight: FontWeight.w500,
              height: 1.4,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ],
    );
  }
}

/// Like _Row but the value can wrap across multiple lines (product titles
/// joined with newlines). The user wants the product *names* in this slot
/// instead of the original "1" count.
class _ProductsRow extends StatelessWidget {
  final List<String> titles;

  const _ProductsRow({required this.titles});

  @override
  Widget build(BuildContext context) {
    final value = titles.isEmpty ? '—' : titles.join('\n');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Товары',
          style: TextStyle(
            color: AppColors.purpleTertiary,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.4,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: AppColors.white,
              fontSize: 15,
              fontWeight: FontWeight.w500,
              height: 1.4,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ],
    );
  }
}

class _SumRow extends StatelessWidget {
  final num value;

  const _SumRow({required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Text(
          'Сумма',
          style: TextStyle(
            color: AppColors.purpleTertiary,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.4,
            letterSpacing: -0.4,
          ),
        ),
        const Spacer(),
        Text(
          formatOrderTenge(value),
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.4,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(width: 2),
        const Text(
          '₸',
          style: TextStyle(
            color: AppColors.white,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.4,
            letterSpacing: -0.4,
          ),
        ),
      ],
    );
  }
}

class _DashedDivider extends StatelessWidget {
  const _DashedDivider();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 1,
      child: CustomPaint(
        painter: _DashedLinePainter(
          color: AppColors.white.withValues(alpha: 0.2),
        ),
      ),
    );
  }
}

class _DashedLinePainter extends CustomPainter {
  final Color color;
  const _DashedLinePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    const dashWidth = 3.0;
    const dashSpace = 4.0;
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1;
    var startX = 0.0;
    while (startX < size.width) {
      canvas.drawLine(
        Offset(startX, 0),
        Offset(startX + dashWidth, 0),
        paint,
      );
      startX += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(_DashedLinePainter oldDelegate) =>
      oldDelegate.color != color;
}

/// Bottom edge of the order card — a row of small semicircles bitten out of
/// the card. Pure paint, no asset. Color matches the card body so the cuts
/// reveal whatever is behind the card.
class _PaperTear extends StatelessWidget {
  const _PaperTear();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 14,
      child: CustomPaint(
        painter: _PaperTearPainter(
          fill: AppColors.white.withValues(alpha: 0.1),
        ),
      ),
    );
  }
}

class _PaperTearPainter extends CustomPainter {
  final Color fill;
  const _PaperTearPainter({required this.fill});

  @override
  void paint(Canvas canvas, Size size) {
    const radius = 7.0;
    final paint = Paint()..color = fill;
    final path = Path();
    // Build the silhouette: top edge straight, bottom edge a row of
    // semicircles biting upward (so the empty crescents appear below the
    // card, giving the coupon look).
    path.moveTo(0, 0);
    path.lineTo(size.width, 0);
    path.lineTo(size.width, size.height - radius);
    var x = size.width;
    while (x > 0) {
      final next = (x - radius * 2).clamp(0.0, size.width);
      path.arcToPoint(
        Offset(next, size.height - radius),
        radius: const Radius.circular(radius),
        clockwise: true,
      );
      x = next;
      if (x <= 0) break;
    }
    path.lineTo(0, 0);
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_PaperTearPainter oldDelegate) =>
      oldDelegate.fill != fill;
}
