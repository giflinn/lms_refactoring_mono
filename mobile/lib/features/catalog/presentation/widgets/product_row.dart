import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../domain/product.dart';

/// Single product row in the catalog list (or in search results).
/// Title + optional subtitle, with a 0.5px hairline divider beneath. Tap is
/// optional — the home screen leaves it as a no-op until product detail
/// view ships.
class ProductRow extends StatelessWidget {
  final Product product;
  final VoidCallback? onTap;

  const ProductRow({super.key, required this.product, this.onTap});

  @override
  Widget build(BuildContext context) {
    final hasSubtitle =
        product.subtitle != null && product.subtitle!.trim().isNotEmpty;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        color: AppColors.purpleTertiary.withValues(alpha: 0.2),
                        width: 0.5,
                      ),
                    ),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.white,
                          fontSize: 17,
                          height: 1.3,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (hasSubtitle) ...[
                        const SizedBox(height: 2),
                        Text(
                          product.subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.purpleTertiary,
                            fontSize: 15,
                            height: 1.4,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right,
                color: AppColors.purpleTertiary.withValues(alpha: 0.8),
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
