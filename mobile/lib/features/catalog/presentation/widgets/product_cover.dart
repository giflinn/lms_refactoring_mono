import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/catalog_api_provider.dart';
import '../../domain/product.dart';

/// Cover image at the top of the product detail page. Uses the same
/// `cover_active.png` asset the catalog cards do for `coverKind=preset`, and
/// falls back to it when a network image fails or is still loading.
class ProductCover extends ConsumerWidget {
  final Product product;
  const ProductCover({super.key, required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(catalogApiProvider);
    final url = api.resolveCoverUrl(product.coverImageUrl);

    Widget image;
    if (product.coverKind != ProductCoverKind.preset && url != null) {
      image = Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const _PresetCover(),
        loadingBuilder: (ctx, child, progress) {
          if (progress == null) return child;
          return const _PresetCover();
        },
      );
    } else {
      image = const _PresetCover();
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: AspectRatio(
        aspectRatio: 16 / 11,
        child: image,
      ),
    );
  }
}

class _PresetCover extends StatelessWidget {
  const _PresetCover();

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/product_cover/cover_active.png',
      fit: BoxFit.cover,
    );
  }
}
