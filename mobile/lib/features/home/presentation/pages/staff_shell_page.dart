import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/brand_logotype.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../../core/widgets/user_avatar.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
import '../../../cancellations/presentation/controller/staff_cancellations_controller.dart';
import '../../../cancellations/presentation/pages/staff_cancellations_list_page.dart';
import '../../../chat/presentation/controller/chat_controllers.dart';
import '../../../chat/presentation/pages/staff_chat_list_page.dart';
import '../../../clients/presentation/pages/clients_list_page.dart';
import '../../../orders/presentation/controller/staff_orders_controller.dart';
import '../../../orders/presentation/pages/staff_orders_list_page.dart';
import '../widgets/role_bottom_nav.dart';
import 'under_construction_page.dart';

const _chatSortLabels = {
  'name': 'Сортировать А-Я',
  'newest': 'Сначала новые',
  'oldest': 'Сначала старые',
};

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
    final hasNewOrders = ref.watch(hasNewStaffOrdersProvider);
    final hasPendingCancellations =
        ref.watch(hasPendingCancellationsProvider);
    final user = ref.watch(authProvider).value;
    final items = [
      _baseItems[0].copyWith(hasBadge: unread > 0),
      _baseItems[1].copyWith(hasBadge: hasNewOrders),
      _baseItems[2].copyWith(hasBadge: hasPendingCancellations),
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
          actions: _index == 0 ? const [_ChatSortMenu()] : null,
        ),
        body: IndexedStack(
          index: _index,
          children: [
            const StaffChatListPage(),
            const StaffOrdersListPage(),
            const StaffCancellationsListPage(),
            for (var i = 3; i < items.length - 1; i++)
              UnderConstructionPage(title: items[i].label),
            const ClientsListPage(),
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

/// Sort dropdown for the chat tab. Lives in the shell appbar (visible only on
/// the chat tab) rather than inside the chat list page so the topbar exposes
/// it next to the avatar+logo per Figma.
class _ChatSortMenu extends ConsumerWidget {
  const _ChatSortMenu();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sort = ref.watch(staffThreadsProvider).value?.sort ?? 'newest';
    return PopupMenuButton<String>(
      color: AppColors.purpleDark,
      initialValue: sort,
      tooltip: 'Сортировка',
      onSelected: (v) =>
          ref.read(staffThreadsProvider.notifier).setSort(v),
      itemBuilder: (_) => _chatSortLabels.entries
          .map(
            (e) => PopupMenuItem<String>(
              value: e.key,
              child: Text(
                e.value,
                style: const TextStyle(color: AppColors.white),
              ),
            ),
          )
          .toList(),
      icon: SvgPicture.asset(
        'assets/icons/chat/sort.svg',
        width: 24,
        height: 24,
        colorFilter: const ColorFilter.mode(AppColors.white, BlendMode.srcIn),
      ),
    );
  }
}
