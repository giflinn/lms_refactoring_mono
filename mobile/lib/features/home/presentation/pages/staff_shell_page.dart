import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../widgets/role_bottom_nav.dart';
import 'under_construction_page.dart';

class StaffShellPage extends ConsumerStatefulWidget {
  const StaffShellPage({super.key});

  @override
  ConsumerState<StaffShellPage> createState() => _StaffShellPageState();
}

class _StaffShellPageState extends ConsumerState<StaffShellPage> {
  int _index = 0;

  static const _items = [
    NavItem(
      iconActive: 'assets/icons/nav/chat_active.svg',
      iconInactive: 'assets/icons/nav/chat_inactive.svg',
      label: 'Чат',
      hasBadge: true,
    ),
    NavItem(
      iconActive: 'assets/icons/nav/cart_active.svg',
      iconInactive: 'assets/icons/nav/cart_inactive.svg',
      label: 'Заказы',
      hasBadge: true,
    ),
    NavItem(
      iconActive: 'assets/icons/nav/orders_cancel_active.svg',
      iconInactive: 'assets/icons/nav/orders_cancel_inactive.svg',
      label: 'Отмены',
      hasBadge: true,
    ),
    NavItem(
      iconActive: 'assets/icons/nav/comment_active.svg',
      iconInactive: 'assets/icons/nav/comment_inactive.svg',
      label: 'Отзывы',
      hasBadge: true,
    ),
    NavItem(
      iconActive: 'assets/icons/nav/clients_active.svg',
      iconInactive: 'assets/icons/nav/clients_inactive.svg',
      label: 'Клиенты',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
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
              onPressed: () => ref.read(authProvider.notifier).signOut(),
            ),
          ],
        ),
        body: IndexedStack(
          index: _index,
          children: [
            for (final item in _items)
              UnderConstructionPage(title: item.label),
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
