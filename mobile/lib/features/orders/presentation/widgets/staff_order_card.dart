import 'package:flutter/material.dart';

import '../../../../core/design/tokens.dart';
import '../../domain/order.dart' show formatOrderDate, formatOrderTenge;
import '../../domain/staff_order.dart';
import 'staff_order_status_pill.dart';

/// Coupon-style card for the staff orders list. Same paper-tear bottom edge
/// as the client-side [OrderCard], but with a different field set (Клиент,
/// optional Менеджер, Способ оплаты, paired status badges) and a single
/// whole-card tap target — staff inspects/changes status on the detail
/// screen, never inline from the row.
class StaffOrderCard extends StatelessWidget {
  final StaffOrder order;

  /// Hide the "Менеджер" row when the viewer is a plain manager — every
  /// order in their list is by definition theirs, so showing the column is
  /// noise. Senior managers and admins keep it.
  final bool showManagerRow;

  final VoidCallback onTap;

  const StaffOrderCard({
    super.key,
    required this.order,
    required this.showManagerRow,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              decoration: BoxDecoration(
                color: AppColors.white.withValues(alpha: 0.1),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(14)),
              ),
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _StatusRow(
                    paymentStatus: order.paymentStatus,
                    fulfillmentStatus: order.fulfillmentStatus,
                  ),
                  const SizedBox(height: 12),
                  _Row(
                    label: '№ заказа',
                    value: order.orderNumber.toString(),
                  ),
                  const SizedBox(height: 12),
                  _Row(label: 'Дата', value: formatOrderDate(order.createdAt)),
                  const SizedBox(height: 12),
                  _Row(
                    label: 'Клиент',
                    value: order.client.fullName.isEmpty
                        ? order.client.email
                        : order.client.fullName,
                  ),
                  if (showManagerRow) ...[
                    const SizedBox(height: 12),
                    _Row(
                      label: 'Менеджер',
                      value: order.manager?.fullName.isNotEmpty == true
                          ? order.manager!.fullName
                          : '—',
                    ),
                  ],
                  const SizedBox(height: 12),
                  const _DashedDivider(),
                  const SizedBox(height: 12),
                  _SumRow(value: order.totalTenge),
                  const SizedBox(height: 12),
                  _PaymentMethodRow(method: order.paymentMethod),
                ],
              ),
            ),
            const _PaperTear(),
          ],
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final PaymentStatus paymentStatus;
  final FulfillmentStatus fulfillmentStatus;

  const _StatusRow({
    required this.paymentStatus,
    required this.fulfillmentStatus,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              PaymentStatusPill(status: paymentStatus),
              FulfillmentStatusPill(status: fulfillmentStatus),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Icon(
          Icons.chevron_right,
          color: AppColors.white.withValues(alpha: 0.6),
          size: 22,
        ),
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
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
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

/// "Способ оплаты [icon] Kaspi/Карта" row, driven by the order's
/// payment_method ('kaspi' | 'card' | null → Kaspi).
class _PaymentMethodRow extends StatelessWidget {
  final String? method;
  const _PaymentMethodRow({this.method});

  @override
  Widget build(BuildContext context) {
    final isCard = method == 'card';
    return Row(
      children: [
        const Text(
          'Способ оплаты',
          style: TextStyle(
            color: AppColors.purpleTertiary,
            fontSize: 15,
            fontWeight: FontWeight.w500,
            height: 1.4,
            letterSpacing: -0.4,
          ),
        ),
        const Spacer(),
        ClipOval(
          child: Image.asset(
            isCard
                ? 'assets/icons/cart/bank_card.png'
                : 'assets/icons/cart/kaspi.png',
            width: 22,
            height: 22,
            fit: BoxFit.cover,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          isCard ? 'Карта' : 'Kaspi',
          style: const TextStyle(
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
