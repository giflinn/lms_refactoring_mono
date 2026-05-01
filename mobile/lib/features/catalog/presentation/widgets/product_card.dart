import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';
import '../../data/catalog_api.dart';
import '../../domain/product.dart';

/// Square product card used in the promo carousel. Mirrors the Figma "Card"
/// component: optional background image + bottom gradient overlay carrying
/// the category chip (top-left), title + subtitle (bottom), and a yellow
/// "buttonText" CTA. coverKind switches between three layouts:
///   preset      → built-in dark background, full overlay
///   customBg    → network image, full overlay
///   customFull  → just the network image, no overlay
class ProductCard extends StatelessWidget {
  final Product product;
  final CatalogApi api;
  final double size;
  // Single tap handler for both the card surface and the CTA button — both
  // lead to the product detail screen, so threading two callbacks through the
  // tree just to call the same function would be churn.
  final VoidCallback? onTap;

  const ProductCard({
    super.key,
    required this.product,
    required this.api,
    this.size = 312,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final coverUrl = api.resolveCoverUrl(product.coverImageUrl);
    final showOverlay = product.coverKind != ProductCoverKind.customFull;

    // Wrap the clip in a Container so the BoxShadow + border render outside
    // the rounded mask. Figma `4:3114`: 1px white@10% border + drop shadow
    // 0/30/34/-20 in #2D033B (purple-gradient-bottom).
    final card = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.1)),
        boxShadow: const [
          BoxShadow(
            color: AppColors.purpleGradientBottom,
            offset: Offset(0, 30),
            blurRadius: 34,
            spreadRadius: -20,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _Background(
              kind: product.coverKind,
              imageUrl: coverUrl,
            ),
            if (showOverlay) ..._buildOverlay(context),
          ],
        ),
      ),
    );

    if (onTap == null) return card;
    return GestureDetector(
      onTap: onTap,
      child: card,
    );
  }

  List<Widget> _buildOverlay(BuildContext context) {
    final categoryName = product.category?.name;
    return [
      // Bottom gradient + content (title, subtitle, CTA button).
      Positioned(
        left: 0,
        right: 0,
        bottom: 0,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0x002D033B), // transparent purple-gradient-bottom
                Color(0xFF7B08A1),
              ],
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                product.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.white,
                  fontSize: 32,
                  height: 1.1,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.4,
                ),
              ),
              if (product.subtitle != null && product.subtitle!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  product.subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.purpleTertiary,
                    fontSize: 17,
                    height: 1.2,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              _CtaButton(label: product.buttonText, onTap: onTap),
            ],
          ),
        ),
      ),
      // Category chip — top-left.
      if (categoryName != null)
        Positioned(
          top: 12,
          left: 12,
          child: _CategoryChip(label: categoryName),
        ),
    ];
  }
}

class _Background extends StatelessWidget {
  final ProductCoverKind kind;
  final String? imageUrl;
  const _Background({required this.kind, required this.imageUrl});

  @override
  Widget build(BuildContext context) {
    if (kind != ProductCoverKind.preset && imageUrl != null) {
      return Image.network(
        imageUrl!,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const _PresetBackground(),
        loadingBuilder: (ctx, child, progress) {
          if (progress == null) return child;
          return const _PresetBackground();
        },
      );
    }
    return const _PresetBackground();
  }
}

class _PresetBackground extends StatelessWidget {
  const _PresetBackground();

  @override
  Widget build(BuildContext context) {
    // Same mandala/ornament cover the admin uses for `coverKind=preset`. Lives
    // alongside the cards in `assets/product_cover/`. Cropped square — the
    // bottom overlay gradient blends from transparent into the dark purple
    // baked into the PNG.
    return Image.asset(
      'assets/product_cover/cover_active.png',
      fit: BoxFit.cover,
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  const _CategoryChip({required this.label});

  @override
  Widget build(BuildContext context) {
    // Per Figma: transparent fill, only border + text in white@60%.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: AppColors.white.withValues(alpha: 0.6)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: AppColors.white.withValues(alpha: 0.6),
          fontSize: 13,
          height: 1.23,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _CtaButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const _CtaButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: Material(
        color: Colors.transparent,
        child: Ink(
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
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(14),
            child: Center(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.purpleDark,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.4,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
