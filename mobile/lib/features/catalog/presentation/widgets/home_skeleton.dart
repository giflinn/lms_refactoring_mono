import 'package:flutter/material.dart';
import '../../../../core/design/tokens.dart';

/// Loading state mirroring the catalog home layout from Figma node 1595:21523:
/// translucent rounded rectangles where the carousel cards, the "Каталог"
/// header, the category tabs, and the product list rows would land.
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        const SizedBox(height: 8),
        // Carousel placeholder
        SizedBox(
          height: 312,
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            scrollDirection: Axis.horizontal,
            physics: const NeverScrollableScrollPhysics(),
            children: const [
              _CardBox(opacity: 0.2),
              SizedBox(width: 8),
              _CardBox(opacity: 0.5),
              SizedBox(width: 8),
              _CardBox(opacity: 0.2),
            ],
          ),
        ),
        const SizedBox(height: 8),
        // "Каталог" header bar
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: _Bar(width: 129, height: 32, opacity: 0.5),
        ),
        // Category tabs row
        SizedBox(
          height: 54,
          child: ListView(
            scrollDirection: Axis.horizontal,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: const [
              _TabBox(opacity: 0.2),
              SizedBox(width: 8),
              _TabBox(opacity: 0.2),
              SizedBox(width: 8),
              _TabBox(opacity: 1.0),
              SizedBox(width: 8),
              _TabBox(opacity: 0.2),
            ],
          ),
        ),
        const SizedBox(height: 16),
        // List item placeholders
        for (var i = 0; i < 4; i++) const _RowBox(),
      ],
    );
  }
}

class _CardBox extends StatelessWidget {
  final double opacity;
  const _CardBox({required this.opacity});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 312,
      height: 312,
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: opacity),
        borderRadius: BorderRadius.circular(24),
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  final double width;
  final double height;
  final double opacity;
  const _Bar({required this.width, required this.height, required this.opacity});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: opacity),
        borderRadius: BorderRadius.circular(6),
      ),
    );
  }
}

class _TabBox extends StatelessWidget {
  final double opacity;
  const _TabBox({required this.opacity});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 156,
      height: 54,
      decoration: BoxDecoration(
        color: AppColors.white.withValues(alpha: opacity),
        borderRadius: BorderRadius.circular(14),
      ),
    );
  }
}

class _RowBox extends StatelessWidget {
  const _RowBox();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Bar(width: double.infinity, height: 20, opacity: 0.5),
          const SizedBox(height: 5),
          const _Bar(width: 59, height: 16, opacity: 0.2),
        ],
      ),
    );
  }
}
