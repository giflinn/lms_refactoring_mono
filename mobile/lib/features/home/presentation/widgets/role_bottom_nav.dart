import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../../core/design/tokens.dart';

class NavItem {
  final String iconActive;
  final String iconInactive;
  final String label;
  final bool hasBadge;
  const NavItem({
    required this.iconActive,
    required this.iconInactive,
    required this.label,
    this.hasBadge = false,
  });

  NavItem copyWith({bool? hasBadge}) => NavItem(
        iconActive: iconActive,
        iconInactive: iconInactive,
        label: label,
        hasBadge: hasBadge ?? this.hasBadge,
      );
}

class RoleBottomNav extends StatelessWidget {
  final List<NavItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  const RoleBottomNav({
    super.key,
    required this.items,
    required this.currentIndex,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.purplePrimary,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(24),
          topRight: Radius.circular(24),
        ),
        boxShadow: [
          BoxShadow(
            color: Color(0x40000000),
            blurRadius: 17,
            offset: Offset(0, -16),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Row(
            children: List.generate(items.length, (i) {
              final selected = i == currentIndex;
              final item = items[i];
              final tintColor = selected
                  ? AppColors.white
                  : AppColors.white.withValues(alpha: 0.6);
              return Expanded(
                child: InkWell(
                  onTap: () => onTap(i),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 24,
                          height: 24,
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              SvgPicture.asset(
                                selected
                                    ? item.iconActive
                                    : item.iconInactive,
                                width: 24,
                                height: 24,
                                colorFilter: ColorFilter.mode(
                                  tintColor,
                                  BlendMode.srcIn,
                                ),
                              ),
                              if (item.hasBadge && !selected)
                                const Positioned(
                                  right: 1,
                                  top: 1,
                                  child: _Badge(),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.label,
                          style: TextStyle(
                            fontSize: 11,
                            height: 1.1,
                            fontWeight: FontWeight.w500,
                            color: tintColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 7.5,
      height: 7.5,
      decoration: const BoxDecoration(
        color: AppColors.yellowPrimary,
        shape: BoxShape.circle,
      ),
    );
  }
}
