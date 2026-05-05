import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final pos = _scroll.position;
    // ChatMessagesView is reverse: true → pixel 0 is the newest message
    // (bottom), and pixels approaches maxScrollExtent as the user scrolls
    // toward the oldest message. Trigger load-older near the far edge.
    if (pos.maxScrollExtent <= 200) return;
    if (pos.pixels > pos.maxScrollExtent - 200) {
      _maybeLoadOlder();
    }
  }

  Future<void> _maybeLoadOlder() async {
    final s = ref.read(clientChatProvider).value;
    if (s == null || s.loadingOlder || !s.hasMoreOlder || s.messages.isEmpty) {
      return;
    }
    // No scroll-position fix-up needed: with reverse: true, prepending older
    // messages to the chronological list means appending to the visual top,
    // and the user's pixel offset stays put.
    await ref.read(clientChatProvider.notifier).loadOlder();
  }

  void _scrollToBottom({bool jump = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      // reverse: true ListView → bottom == pixel 0.
      const target = 0.0;
      if (jump) {
        _scroll.jumpTo(target);
      } else {
        _scroll.animateTo(
          target,
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

    ref.listen(clientChatProvider, (prev, next) {
      if (!next.hasValue) return;
      // Only scroll to bottom when a NEW message lands (last id changed).
      // Prepending older messages must not yank the user's view.
      final prevLast = prev?.value?.messages.isNotEmpty == true
          ? prev!.value!.messages.last.id
          : null;
      final nextMsgs = next.value!.messages;
      final nextLast = nextMsgs.isNotEmpty ? nextMsgs.last.id : null;
      if (prevLast != nextLast) _scrollToBottom();
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
            data: (s) {
              // No initial jump needed: reverse: true ListView starts at
              // pixel 0 = bottom = latest message.
              return Column(
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
                            // Label every staff message so the client can tell
                            // when a senior manager joins the conversation
                            // alongside their assigned manager. Own messages
                            // stay un-labelled — no need to tag yourself.
                            resolveLabel: (m) {
                              if (s.thread != null &&
                                  m.senderId == s.thread!.client.id) {
                                return null;
                              }
                              final f = m.sender?.firstName.trim() ?? '';
                              return f.isEmpty ? null : f;
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
              );
            },
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
    // Back button only when this page was pushed (e.g. deep-link from a push
    // notification). When chat is rendered as a tab inside ClientShellPage
    // there's nothing to pop — exit happens via the bottom nav.
    final canPop = Navigator.of(context).canPop();
    return Padding(
      padding: EdgeInsets.fromLTRB(canPop ? 8 : 16, 8, 8, 8),
      child: Row(
        children: [
          if (canPop)
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
            icon: Image.asset(
              'assets/icons/chat/help.png',
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
    return ChatEmptyState(title: 'Сообщений пока нет...', subtitle: hoursLine);
  }
}
