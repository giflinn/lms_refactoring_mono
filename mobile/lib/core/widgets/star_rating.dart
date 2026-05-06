import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// Five-star rating widget. Tap-to-set in editable mode, plain icons in
/// readonly mode (default). Used by the review submission sheet (editable)
/// and review cards (readonly).
class StarRating extends StatelessWidget {
  /// Current value 0..5. 0 means "no rating yet" (all stars dim) — only valid
  /// in editable mode; readonly callers should always pass 1..5.
  final int value;

  /// Visible width of one star. Spacing between stars is hard-coded at 4px.
  final double size;

  /// Filled star color. Defaults to the brand yellow used on primary CTAs.
  final Color filledColor;

  /// Empty star color. White at 30% gives a visible outline against the
  /// purple background without competing with the filled stars.
  final Color emptyColor;

  /// When non-null the user can tap a star to change the rating.
  final ValueChanged<int>? onChanged;

  const StarRating({
    super.key,
    required this.value,
    this.size = 28,
    this.filledColor = AppColors.yellowGradientBottom,
    this.emptyColor = const Color(0x4DFFFFFF),
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final readOnly = onChanged == null;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final filled = i < value;
        final star = Icon(
          filled ? Icons.star_rounded : Icons.star_outline_rounded,
          size: size,
          color: filled ? filledColor : emptyColor,
        );
        if (readOnly) {
          return Padding(
            padding: EdgeInsets.only(right: i == 4 ? 0 : 4),
            child: star,
          );
        }
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => onChanged!(i + 1),
          child: Padding(
            padding: EdgeInsets.only(right: i == 4 ? 0 : 4),
            child: star,
          ),
        );
      }),
    );
  }
}
