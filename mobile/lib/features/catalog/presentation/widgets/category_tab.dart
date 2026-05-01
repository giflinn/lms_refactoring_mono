import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../../core/design/tokens.dart';

const _leafAsset = 'assets/icons/catalog/leaf_flourish.svg';
const _leafColor = AppColors.yellowGradientTop;

/// Category-filter pill. Two visual states:
/// - inactive: tertiary-purple text, generous horizontal padding
/// - active:   yellow text flanked by mirrored leaf-flourish SVGs, drop
///             shadow underneath
class CategoryTab extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const CategoryTab({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final shape = BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFFC147E9), AppColors.purplePrimary],
      ),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: AppColors.white.withValues(alpha: 0.1)),
      boxShadow: selected
          ? const [
              // Figma: 0px 30px 34px -20px #2D033B
              BoxShadow(
                color: AppColors.purpleGradientBottom,
                offset: Offset(0, 30),
                blurRadius: 34,
                spreadRadius: -20,
              ),
            ]
          : null,
    );

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: shape,
          child: Padding(
            // Active: 8px all sides, leaves flank the label.
            // Inactive: 40h/17v matching Figma (`px-[40px] py-[17px]`).
            padding: selected
                ? const EdgeInsets.all(8)
                : const EdgeInsets.symmetric(horizontal: 40, vertical: 17),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: selected
                  ? [
                      const _Leaf(),
                      const SizedBox(width: 12),
                      _Label(label: label, selected: true),
                      const SizedBox(width: 12),
                      const _Leaf(mirror: true),
                    ]
                  : [_Label(label: label, selected: false)],
            ),
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String label;
  final bool selected;
  const _Label({required this.label, required this.selected});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: selected ? AppColors.yellowGradientTop : AppColors.purpleTertiary,
        fontSize: 15,
        height: 1.34,
        fontWeight: FontWeight.w500,
      ),
    );
  }
}

class _Leaf extends StatelessWidget {
  final bool mirror;
  const _Leaf({this.mirror = false});

  @override
  Widget build(BuildContext context) {
    final svg = SvgPicture.asset(
      _leafAsset,
      width: 20,
      height: 38,
      colorFilter: const ColorFilter.mode(_leafColor, BlendMode.srcIn),
    );
    if (!mirror) return svg;
    // The Figma right-side leaf is the same path mirrored horizontally; matrix
    // (-1, 1) flips x. Avoids needing two separate asset files.
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.identity()..scaleByDouble(-1.0, 1.0, 1.0, 1.0),
      child: svg,
    );
  }
}
