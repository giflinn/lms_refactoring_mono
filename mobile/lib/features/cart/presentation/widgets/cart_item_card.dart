import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../../catalog/domain/ru_dates.dart';
import '../../domain/cart_item.dart';

/// One purchased line in the cart: category chip + delete icon, then
/// title and (date | price) row. Tapping the card body opens the product
/// detail (so the user can review what they put in the cart); the delete
/// icon remains an in-place shortcut so they don't have to drill in just
/// to remove a row.
class CartItemCard extends StatelessWidget {
  final CartItem item;
  final VoidCallback onRemove;
  final VoidCallback onOpen;

  const CartItemCard({
    super.key,
    required this.item,
    required this.onRemove,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onOpen,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: _Body(item: item, onRemove: onRemove),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final CartItem item;
  final VoidCallback onRemove;
  const _Body({required this.item, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (item.categoryName != null) _CategoryChip(item.categoryName!),
            const Spacer(),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: onRemove,
              child: const SizedBox(
                width: 24,
                height: 24,
                child: Icon(
                  Icons.delete_outline,
                  color: AppColors.white,
                  size: 22,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          item.title,
          style: const TextStyle(
            color: AppColors.white,
            fontSize: 17,
            fontWeight: FontWeight.w500,
            height: 1.3,
            letterSpacing: -0.4,
          ),
        ),
        const SizedBox(height: 4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(
                _subtitle(item),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.purpleTertiary,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  height: 1.4,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            Text(
              '${formatTenge(item.price)} ₸',
              style: const TextStyle(
                color: AppColors.yellowPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w500,
                height: 1.4,
                letterSpacing: -0.4,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

String _subtitle(CartItem item) {
  final start = item.bookedStart;
  if (start != null) {
    final local = start.toLocal();
    return '${local.day} ${monthGenitive(local.month)}, ${hhmm(local)}';
  }
  return item.subtitleFallback ?? '';
}

class _CategoryChip extends StatelessWidget {
  final String name;
  const _CategoryChip(this.name);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(100),
        border: Border.all(
          color: AppColors.white.withValues(alpha: 0.6),
          width: 1,
        ),
      ),
      child: Text(
        name,
        style: TextStyle(
          color: AppColors.white.withValues(alpha: 0.6),
          fontSize: 13,
          fontWeight: FontWeight.w500,
          height: 16 / 13,
        ),
      ),
    );
  }
}

/// "10 000" — integer tenge with thin-space thousands. Decimals are dropped:
/// the cart total is always an integer in current usage.
String formatTenge(num value) {
  final whole = value.truncate().toString();
  return whole.replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]} ',
  );
}
