import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../../../core/widgets/brand_logotype.dart';
import '../../../chat/presentation/controller/chat_controllers.dart';
import '../../../chat/presentation/pages/staff_chat_list_page.dart';
import '../widgets/role_bottom_nav.dart';
import 'under_construction_page.dart';

class StaffShellPage extends ConsumerStatefulWidget {
  const StaffShellPage({super.key});

  @override
  ConsumerState<StaffShellPage> createState() => _StaffShellPageState();
}

class _StaffShellPageState extends ConsumerState<StaffShellPage> {
  int _index = 0;

  static const _baseItems = [
    NavItem(
      iconActive: 'assets/icons/nav/chat_active.svg',
      iconInactive: 'assets/icons/nav/chat_inactive.svg',
      label: 'Чат',
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
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    final user = ref.watch(authProvider).value;
    final items = [
      _baseItems[0].copyWith(hasBadge: unread > 0),
      _baseItems[1],
      _baseItems[2],
      _baseItems[3],
      _baseItems[4],
    ];
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          automaticallyImplyLeading: false,
          titleSpacing: 16,
          title: Row(
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => context.push('/staff/profile'),
                child: UserAvatar(
                  avatarUrl: user?.avatarUrl,
                  firstName: user?.firstName ?? '',
                  lastName: user?.lastName ?? '',
                  size: 38,
                ),
              ),
              const SizedBox(width: 16),
              const BrandLogotype(height: 26),
            ],
          ),
        ),
        body: IndexedStack(
          index: _index,
          children: [
            const StaffChatListPage(),
            for (var i = 1; i < items.length; i++)
              UnderConstructionPage(title: items[i].label),
          ],
        ),
        bottomNavigationBar: RoleBottomNav(
          items: items,
          currentIndex: _index,
          onTap: (i) => setState(() => _index = i),
        ),
      ),
    );
  }
}
