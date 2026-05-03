import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../../cart/presentation/controller/cart_controller.dart';
import '../../../cart/presentation/pages/cart_page.dart';
import '../../../catalog/presentation/pages/favorites_page.dart';
import '../../../catalog/presentation/pages/home_page.dart';
import '../../../chat/presentation/controller/chat_controllers.dart';
import '../controller/client_shell_tab_controller.dart';
import '../widgets/role_bottom_nav.dart';
import 'under_construction_page.dart';

class ClientShellPage extends ConsumerWidget {
  const ClientShellPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(clientShellTabProvider);
    final cartCount = ref.watch(cartProvider).length;
    final unread = ref.watch(unreadCountProvider).value ?? 0;

    final items = [
      const NavItem(
        iconActive: 'assets/icons/nav/home_active.svg',
        iconInactive: 'assets/icons/nav/home_inactive.svg',
        label: 'Главная',
      ),
      NavItem(
        iconActive: 'assets/icons/nav/chat_active.svg',
        iconInactive: 'assets/icons/nav/chat_inactive.svg',
        label: 'Чат',
        hasBadge: unread > 0,
      ),
      NavItem(
        iconActive: 'assets/icons/nav/cart_active.svg',
        iconInactive: 'assets/icons/nav/cart_inactive.svg',
        label: 'Корзина',
        hasBadge: cartCount > 0,
      ),
      const NavItem(
        iconActive: 'assets/icons/nav/favorites_active.svg',
        iconInactive: 'assets/icons/nav/favorites_inactive.svg',
        label: 'Избранное',
      ),
      const NavItem(
        iconActive: 'assets/icons/nav/profile_active.svg',
        iconInactive: 'assets/icons/nav/profile_inactive.svg',
        label: 'Кабинет',
      ),
    ];

    void goTo(int i) {
      // Chat is a pushed route (not a tab) so the shell's bottom nav hides
      // while the user is in the conversation. Stay on whatever tab is
      // currently active in the IndexedStack.
      if (i == 1) {
        context.push('/client/chat');
        return;
      }
      ref.read(clientShellTabProvider.notifier).goTo(i);
    }

    // Tabs that own their full header (logotype + search/title) keep the
    // Scaffold's appBar null — they'd otherwise stack a redundant AppBar on
    // top of their own. Tabs still under construction keep the generic
    // AppBar + logout affordance.
    final ownsHeader = index == 0 || index == 2 || index == 3;
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: ownsHeader
            ? null
            : AppBar(
                backgroundColor: Colors.transparent,
                elevation: 0,
                title: Text(
                  items[index].label,
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
          index: index,
          children: [
            const CatalogHomePage(),
            // Chat is opened as a pushed route (see goTo above), never shown
            // here. Placeholder keeps IndexedStack indices aligned with nav.
            const SizedBox.shrink(),
            CartPage(onGoToCatalog: () => goTo(0)),
            FavoritesPage(onGoToCatalog: () => goTo(0)),
            UnderConstructionPage(title: items[4].label),
          ],
        ),
        bottomNavigationBar: RoleBottomNav(
          items: items,
          currentIndex: index,
          onTap: goTo,
        ),
      ),
    );
  }
}
