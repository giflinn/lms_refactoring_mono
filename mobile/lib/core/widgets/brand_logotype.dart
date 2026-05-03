import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../design/tokens.dart';

/// "Slyamova Zhanna" horizontal logotype (Figma node 15:8716). Composed from
/// three separate SVG pieces — the stylized "S" (split into two glyphs) and
/// the wordmark — positioned per the original Figma metrics. Tinted from a
/// caller-supplied [color] so the same widget can render on dark gradients
/// (white) or light backgrounds.
class BrandLogotype extends StatelessWidget {
  final Color color;
  final double height;

  const BrandLogotype({
    super.key,
    this.color = AppColors.white,
    this.height = 26,
  });

  // Figma intrinsic metrics: 160.404 × 26 (≈21px S monogram + 139.404px wordmark).
  static const double _intrinsicWidth = 160.404;
  static const double _intrinsicHeight = 26.0;

  @override
  Widget build(BuildContext context) {
    final scale = height / _intrinsicHeight;
    final filter = ColorFilter.mode(color, BlendMode.srcIn);
    return SizedBox(
      width: _intrinsicWidth * scale,
      height: height,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 3.03 * scale,
            top: 0,
            width: 14.042 * scale,
            height: 14.133 * scale,
            child: SvgPicture.asset(
              'assets/icons/logo/s_top.svg',
              colorFilter: filter,
              fit: BoxFit.fill,
            ),
          ),
          Positioned(
            left: 0,
            top: 6.6 * scale,
            width: 10.598 * scale,
            height: 17.396 * scale,
            child: SvgPicture.asset(
              'assets/icons/logo/s_bottom.svg',
              colorFilter: filter,
              fit: BoxFit.fill,
            ),
          ),
          Positioned(
            left: 21 * scale,
            top: 8 * scale,
            width: 139.404 * scale,
            height: 18 * scale,
            child: SvgPicture.asset(
              'assets/icons/logo/wordmark.svg',
              colorFilter: filter,
              fit: BoxFit.fill,
            ),
          ),
        ],
      ),
    );
  }
}
