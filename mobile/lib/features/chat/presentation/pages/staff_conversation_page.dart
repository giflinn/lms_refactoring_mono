import 'dart:async';
import 'dart:io';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../data/chat_api_provider.dart';
import '../../data/chat_socket.dart';
import '../../domain/chat_format.dart';
import '../../domain/chat_models.dart';
import '../widgets/chat_avatar.dart';
import '../widgets/chat_messages_view.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_input.dart';

/// Staff-side conversation. State lives in this widget rather than a Riverpod
/// family provider — there's only ever one open at a time, so a local
/// StatefulWidget gives us a simpler reactivity boundary while still using
/// the shared chat socket/api providers for I/O.
class StaffConversationPage extends ConsumerStatefulWidget {
  final String threadId;

  const StaffConversationPage({super.key, required this.threadId});

  @override
  ConsumerState<StaffConversationPage> createState() =>
      _StaffConversationPageState();
}

class _StaffConversationPageState
    extends ConsumerState<StaffConversationPage> {
  final _scroll = ScrollController();
  StreamSubscription<ChatMessage>? _msgSub;
  StreamSubscription<({String userId, bool online, DateTime? lastSeenAt})>?
      _presSub;

  bool _loading = true;
  Object? _error;
  ChatThread? _thread;
  ChatThreadAccess? _access;
  List<ChatMessage> _messages = const [];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _msgSub?.cancel();
    _presSub?.cancel();
    final socket = ref.read(chatSocketProvider);
    socket.focusThread(null);
    _scroll.dispose();
    super.dispose();
  }

  Future<String> _idToken() async {
    final u = fb.FirebaseAuth.instance.currentUser;
    if (u == null) throw StateError('not_authenticated');
    final t = await u.getIdToken();
    if (t == null) throw StateError('no_id_token');
    return t;
  }

  Future<void> _bootstrap() async {
    try {
      final api = ref.read(chatApiProvider);
      final socket = ref.read(chatSocketProvider);
      await socket.connect();
      final token = await _idToken();
      final detail =
          await api.getThread(idToken: token, threadId: widget.threadId);
      final messages = await api.listMessages(
        idToken: token,
        threadId: widget.threadId,
      );
      if (!mounted) return;
      setState(() {
        _thread = detail.thread;
        _access = detail.access;
        _messages = messages;
        _loading = false;
      });
      _scrollToBottom();
      socket.focusThread(widget.threadId);
      unawaited(api.markRead(idToken: token, threadId: widget.threadId));
      _msgSub = socket.onMessageNew.listen(_onIncoming);
      _presSub = socket.onPresence.listen(_onPresence);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  void _onIncoming(ChatMessage m) {
    if (!mounted) return;
    if (m.threadId != widget.threadId) return;
    if (_messages.any((x) => x.id == m.id)) return;
    setState(() {
      _messages = [..._messages, m];
    });
    _scrollToBottom();
    unawaited(_idToken().then((token) =>
        ref.read(chatApiProvider).markRead(
              idToken: token,
              threadId: widget.threadId,
            )));
  }

  void _onPresence(
      ({String userId, bool online, DateTime? lastSeenAt}) e) {
    if (!mounted || _thread == null) return;
    final t = _thread!;
    if (t.client.id == e.userId) {
      setState(() {
        _thread = ChatThread(
          id: t.id,
          client:
              t.client.copyWith(online: e.online, lastSeenAt: e.lastSeenAt),
          manager: t.manager,
          lastMessageAt: t.lastMessageAt,
          lastMessagePreview: t.lastMessagePreview,
          unreadCount: t.unreadCount,
          createdAt: t.createdAt,
        );
      });
    }
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

  Future<void> _send(String body, List<File> files) async {
    final api = ref.read(chatApiProvider);
    final token = await _idToken();
    final m = await api.sendMessage(
      idToken: token,
      threadId: widget.threadId,
      body: body.isEmpty ? null : body,
      files: files,
    );
    if (!mounted) return;
    if (_messages.any((x) => x.id == m.id)) return;
    setState(() {
      _messages = [..._messages, m];
    });
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: AppColors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: _thread == null
              ? const SizedBox.shrink()
              : Row(
                  children: [
                    ChatAvatar(user: _thread!.client, size: 32),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _thread!.client.fullName,
                            style: const TextStyle(
                              color: AppColors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            formatPresence(
                              _thread!.client.online,
                              _thread!.client.lastSeenAt,
                            ),
                            style: TextStyle(
                              color: AppColors.white.withValues(alpha: 0.7),
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
        body: SafeArea(
          top: false,
          child: _buildBody(),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.white),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Не удалось загрузить чат: $_error',
            style: const TextStyle(color: AppColors.white),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return Column(
      children: [
        Expanded(
          child: _messages.isEmpty
              ? Center(
                  child: Text(
                    'Сообщений пока нет',
                    style: TextStyle(
                      color: AppColors.white.withValues(alpha: 0.7),
                    ),
                  ),
                )
              : ChatMessagesView(
                  controller: _scroll,
                  messages: _messages,
                  resolveSide: (m) {
                    if (m.isSystem) return BubbleSide.center;
                    if (m.sender?.role == 'client') return BubbleSide.left;
                    return BubbleSide.right;
                  },
                ),
        ),
        if (_access?.canWrite == true)
          MessageInput(onSend: _send),
      ],
    );
  }
}
