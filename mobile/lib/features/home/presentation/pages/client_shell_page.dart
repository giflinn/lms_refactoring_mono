import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../../catalog/presentation/pages/favorites_page.dart';
import '../../../catalog/presentation/pages/home_page.dart';
import '../widgets/role_bottom_nav.dart';
import 'under_construction_page.dart';

class ClientShellPage extends ConsumerStatefulWidget {
  const ClientShellPage({super.key});

  @override
  ConsumerState<ClientShellPage> createState() => _ClientShellPageState();
}

class _ClientShellPageState extends ConsumerState<ClientShellPage> {
  int _index = 0;

  static const _items = [
    NavItem(
      iconActive: 'assets/icons/nav/home_active.svg',
      iconInactive: 'assets/icons/nav/home_inactive.svg',
      label: 'Главная',
    ),
    NavItem(
      iconActive: 'assets/icons/nav/chat_active.svg',
      iconInactive: 'assets/icons/nav/chat_inactive.svg',
      label: 'Чат',
      hasBadge: true,
    ),
    NavItem(
      iconActive: 'assets/icons/nav/cart_active.svg',
      iconInactive: 'assets/icons/nav/cart_inactive.svg',
      label: 'Корзина',
      hasBadge: true,
    ),
    NavItem(
      iconActive: 'assets/icons/nav/favorites_active.svg',
      iconInactive: 'assets/icons/nav/favorites_inactive.svg',
      label: 'Избранное',
    ),
    NavItem(
      iconActive: 'assets/icons/nav/profile_active.svg',
      iconInactive: 'assets/icons/nav/profile_inactive.svg',
      label: 'Кабинет',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    // Tabs that own their full header (logotype + search/title) keep the
    // Scaffold's appBar null — they'd otherwise stack a redundant AppBar on
    // top of their own. Tabs still under construction keep the generic
    // AppBar + logout affordance.
    final ownsHeader = _index == 0 || _index == 3;
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: ownsHeader
            ? null
            : AppBar(
                backgroundColor: Colors.transparent,
                elevation: 0,
                title: Text(
                  _items[_index].label,
                  style: const TextStyle(
                    color: AppColors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.logout, color: AppColors.white),
                    tooltip: 'Выйти',
                    onPressed: () =>
                        ref.read(authProvider.notifier).signOut(),
                  ),
                ],
              ),
        body: IndexedStack(
          index: _index,
          children: [
            const CatalogHomePage(),
            UnderConstructionPage(title: _items[1].label),
            UnderConstructionPage(title: _items[2].label),
            FavoritesPage(onGoToCatalog: () => setState(() => _index = 0)),
            UnderConstructionPage(title: _items[4].label),
          ],
        ),
        bottomNavigationBar: RoleBottomNav(
          items: _items,
          currentIndex: _index,
          onTap: (i) => setState(() => _index = i),
        ),
      ),
    );
  }
}
