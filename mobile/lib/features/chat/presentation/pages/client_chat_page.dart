import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../data/support_provider.dart';
import '../../domain/chat_models.dart';
import '../controller/chat_controllers.dart';
import '../widgets/chat_avatar.dart';
import '../widgets/chat_empty_state.dart';
import '../widgets/chat_help_dialog.dart';
import '../widgets/chat_messages_view.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_input.dart';

class ClientChatPage extends ConsumerStatefulWidget {
  const ClientChatPage({super.key});

  @override
  ConsumerState<ClientChatPage> createState() => _ClientChatPageState();
}

class _ClientChatPageState extends ConsumerState<ClientChatPage> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (!_scroll.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final asyncState = ref.watch(clientChatProvider);
    final supportAsync = ref.watch(supportInfoProvider);

    ref.listen(clientChatProvider, (_, next) {
      if (next.hasValue) _scrollToBottom();
    });

    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          child: asyncState.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.white),
            ),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Не удалось загрузить чат: $e',
                  style: const TextStyle(color: AppColors.white),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
            data: (s) => Column(
              children: [
                _Header(
                  manager: s.thread?.manager,
                  onHelpTap: () {
                    final info = supportAsync.maybeWhen(
                      data: (v) => v,
                      orElse: () =>
                          const SupportInfo(whatsapp: '', hours: ''),
                    );
                    ChatHelpDialog.show(context, info);
                  },
                ),
                Expanded(
                  child: s.messages.isEmpty
                      ? _ClientEmpty(
                          hours: supportAsync.maybeWhen(
                            data: (v) => v.hours,
                            orElse: () => '',
                          ),
                        )
                      : ChatMessagesView(
                          controller: _scroll,
                          messages: s.messages,
                          resolveSide: (m) {
                            if (m.isSystem) return BubbleSide.center;
                            // Client viewer: own messages → right.
                            if (s.thread != null &&
                                m.senderId == s.thread!.client.id) {
                              return BubbleSide.right;
                            }
                            return BubbleSide.left;
                          },
                        ),
                ),
                MessageInput(
                  onSend: (body, files) async {
                    await ref
                        .read(clientChatProvider.notifier)
                        .sendMessage(body, files);
                    _scrollToBottom();
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final ChatUserSummary? manager;
  final VoidCallback onHelpTap;

  const _Header({required this.manager, required this.onHelpTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.arrow_back, color: AppColors.white),
          ),
          if (manager != null) ChatAvatar(user: manager!, size: 40),
          if (manager != null) const SizedBox(width: 12),
          Expanded(
            child: manager == null
                ? const Text(
                    'Чат с менеджером',
                    style: TextStyle(
                      color: AppColors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Менеджер',
                        style: TextStyle(
                          color: AppColors.white.withValues(alpha: 0.7),
                          fontSize: 11,
                        ),
                      ),
                      Text(
                        manager!.fullName,
                        style: const TextStyle(
                          color: AppColors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
          ),
          IconButton(
            onPressed: onHelpTap,
            icon: SvgPicture.asset(
              'assets/icons/chat/help.svg',
              width: 22,
              height: 22,
            ),
          ),
        ],
      ),
    );
  }
}

class _ClientEmpty extends StatelessWidget {
  final String hours;

  const _ClientEmpty({required this.hours});

  @override
  Widget build(BuildContext context) {
    final hoursLine = hours.isNotEmpty
        ? 'Напишите сообщение чтобы начать общение с менеджером. Часы работы $hours'
        : 'Напишите сообщение чтобы начать общение с менеджером.';
    return ChatEmptyState(
      title: 'Сообщений пока нет...',
      subtitle: hoursLine,
    );
  }
}
