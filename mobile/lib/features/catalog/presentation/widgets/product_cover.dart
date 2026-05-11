import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/catalog_api_provider.dart';
import '../../domain/product.dart';

/// Cover image at the top of the product detail page. Mirrors the carousel
/// card's cover-kind logic (see [ProductCard]):
///   preset      → built-in mandala asset, with a subtle bottom gradient.
///   customBg    → network image, with the same bottom gradient overlay so
///                 the cover blends into the dark page background.
///   customFull  → network image only, no overlay.
/// The detail page renders title/CTA below the cover, so the overlay here is
/// just the dark gradient — no chip/title/button.
class ProductCover extends ConsumerWidget {
  final Product product;
  const ProductCover({super.key, required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(catalogApiProvider);
    final url = api.resolveCoverUrl(product.coverImageUrl);
    final showOverlay = product.coverKind != ProductCoverKind.customFull;

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: AspectRatio(
        aspectRatio: 16 / 11,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _Background(kind: product.coverKind, imageUrl: url),
            if (showOverlay) const _BottomGradient(),
          ],
        ),
      ),
    );
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
    return Image.asset(
      'assets/product_cover/cover_active.png',
      fit: BoxFit.cover,
    );
  }
}

class _BottomGradient extends StatelessWidget {
  const _BottomGradient();

  @override
  Widget build(BuildContext context) {
    // Same gradient the carousel card uses, so a detail navigated from the
    // carousel feels visually continuous. Stops cover the bottom ~60% to
    // match the carousel's content-area proportion.
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0x002D033B),
            Color(0xFF7B08A1),
          ],
          stops: [0.4, 1.0],
        ),
      ),
    );
  }
}
