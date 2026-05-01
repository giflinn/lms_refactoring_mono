import 'dart:async';
import 'package:flutter/material.dart';
import '../../data/catalog_api.dart';
import '../../domain/product.dart';
import 'product_card.dart';

/// Swipeable carousel of promo products. Auto-advances every 5 seconds,
/// pauses while the user is mid-drag, and resumes after the gesture ends.
/// Loops infinitely by mapping a high-index page to `index % length`.
class PromoCarousel extends StatefulWidget {
  final List<Product> products;
  final CatalogApi api;
  final void Function(Product product)? onTap;
  final Duration interval;

  const PromoCarousel({
    super.key,
    required this.products,
    required this.api,
    this.onTap,
    this.interval = const Duration(seconds: 5),
  });

  @override
  State<PromoCarousel> createState() => _PromoCarouselState();
}

class _PromoCarouselState extends State<PromoCarousel> {
  static const _virtualLength = 10000;
  // Page slot occupies 87.5% of the viewport. On a 393-px iPhone that's
  // ~344 px → 24-25 px peek of each neighbor. Matches Figma 4:3114 layout
  // (which used 312 / 360 = 86.7%) but stays proportional on wider screens.
  static const _viewportFraction = 0.875;
  // Per-page horizontal padding splits this in half on each side, so the
  // visible breathing room between adjacent cards equals _gap. 4 looked
  // crowded ("слипались"); 8 keeps cards nearly the same size but doubles
  // the gap.
  static const _gap = 8.0;
  // Just enough breathing room for the +30 y / 34 blur shadow to render
  // without visually slamming into the next ListView item. The actual shadow
  // extends ~47px below; clipBehavior: Clip.none on the PageView lets the
  // remainder bleed into the "Каталог" header area on top of the gradient.
  static const _shadowBottomBleed = 12.0;

  late final PageController _controller;
  Timer? _timer;
  bool _userInteracting = false;

  @override
  void initState() {
    super.initState();
    final initial = widget.products.isEmpty
        ? 0
        : (_virtualLength ~/ 2) -
            ((_virtualLength ~/ 2) % widget.products.length);
    _controller = PageController(
      viewportFraction: _viewportFraction,
      initialPage: initial,
    );
    _scheduleAutoAdvance();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _scheduleAutoAdvance() {
    _timer?.cancel();
    if (widget.products.length < 2) return;
    _timer = Timer.periodic(widget.interval, (_) {
      if (_userInteracting) return;
      if (!_controller.hasClients) return;
      final next = (_controller.page ?? _controller.initialPage.toDouble()) + 1;
      _controller.animateToPage(
        next.round(),
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.products.isEmpty) return const SizedBox.shrink();

    // Card sizes from the actual viewport so on bigger phones the cards grow
    // alongside it — keeping the inter-card gap small without leaving wide
    // empty channels on the sides.
    return LayoutBuilder(builder: (ctx, constraints) {
      final viewportW = constraints.maxWidth;
      final slotW = viewportW * _viewportFraction;
      final cardW = slotW - _gap;

      return SizedBox(
        // Extra room below for the +30 y / 34 blur shadow without clipping it.
        height: cardW + _shadowBottomBleed,
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n is ScrollStartNotification) {
              _userInteracting = true;
            } else if (n is ScrollEndNotification) {
              _userInteracting = false;
            }
            return false;
          },
          child: PageView.builder(
            controller: _controller,
            itemCount: _virtualLength,
            // Cards carry a downward shadow ~47px below their bottom edge —
            // PageView clips by default, which hides it. clipBehavior: none
            // lets the shadow paint into the breathing-room space below.
            clipBehavior: Clip.none,
            itemBuilder: (ctx, virtualIndex) {
              final realIndex = virtualIndex % widget.products.length;
              final product = widget.products[realIndex];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: _gap / 2),
                child: Align(
                  alignment: Alignment.topCenter,
                  child: ProductCard(
                    product: product,
                    api: widget.api,
                    size: cardW,
                    onTap: widget.onTap == null
                        ? null
                        : () => widget.onTap!(product),
                  ),
                ),
              );
            },
          ),
        ),
      );
    });
  }
}
