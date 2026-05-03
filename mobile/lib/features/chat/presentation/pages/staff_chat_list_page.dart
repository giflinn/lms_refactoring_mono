import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../controller/chat_controllers.dart';
import '../widgets/chat_empty_state.dart';
import '../widgets/chat_list_item.dart';

class StaffChatListPage extends ConsumerWidget {
  const StaffChatListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncState = ref.watch(staffThreadsProvider);
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: asyncState.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.white),
            ),
            error: (e, _) => Center(
              child: Text(
                'Ошибка загрузки чатов: $e',
                style: const TextStyle(color: AppColors.white),
              ),
            ),
            data: (s) {
              final threads = s.threads;
              if (threads.isEmpty) return _StaffEmpty();
              return RefreshIndicator(
                color: AppColors.purplePrimary,
                onRefresh: () =>
                    ref.read(staffThreadsProvider.notifier).refresh(),
                child: ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  itemCount: threads.length,
                  itemBuilder: (_, i) => ChatListItem(
                    thread: threads[i],
                    onTap: () => context.push('/staff/chat/${threads[i].id}'),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _StaffEmpty extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ChatEmptyState(
      title: 'Сообщений пока нет...',
      subtitle: 'Выберите клиента чтобы начать общение.',
      action: ElevatedButton(
        onPressed: () {
          // The "Клиенты" tab is the dedicated client list — switch to it.
          // Index 4 of the staff bottom nav per StaffShellPage.
          DefaultTabController.maybeOf(context); // no-op, marker only
          // Plain feedback fallback so the button isn't dead until the
          // clients tab is implemented.
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Откройте таб «Клиенты»'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.yellowGradientTop,
          foregroundColor: AppColors.purpleGradientBottom,
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
        ),
        child: const Text(
          'Клиенты',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}
