import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../../core/design/tokens.dart';

/// "Без результатов" state shown when a query returned nothing. Uses two
/// composed SVGs (magnifier outline + "?" glyph) tinted purple-tertiary, so
/// it matches the Figma illustration without bundling raster assets.
class SearchEmptyState extends StatelessWidget {
  const SearchEmptyState({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const _Illustration(),
          const SizedBox(height: 24),
          const Text(
            'Без результатов',
            style: TextStyle(
              color: AppColors.white,
              fontSize: 17,
              fontWeight: FontWeight.w500,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Извините, мы не смогли найти ничего подходящего по вашему запросу.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.purpleTertiary.withValues(alpha: 0.95),
              fontSize: 15,
              height: 1.34,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Возможно вас что-то заинтересует из популярных запросов',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: AppColors.purpleTertiary.withValues(alpha: 0.95),
              fontSize: 15,
              height: 1.34,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _Illustration extends StatelessWidget {
  const _Illustration();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 100,
      height: 100,
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(8.33),
              child: SvgPicture.asset(
                'assets/icons/search/lens.svg',
                colorFilter: const ColorFilter.mode(
                  AppColors.purpleTertiary,
                  BlendMode.srcIn,
                ),
              ),
            ),
          ),
          // "?" — absolute inset 32%/47.5%/37.33%/40% relative to the 100px box.
          Positioned(
            top: 32,
            bottom: 37.33,
            left: 40,
            right: 47.5,
            child: SvgPicture.asset(
              'assets/icons/search/question.svg',
              fit: BoxFit.contain,
              colorFilter: const ColorFilter.mode(
                AppColors.purpleTertiary,
                BlendMode.srcIn,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
