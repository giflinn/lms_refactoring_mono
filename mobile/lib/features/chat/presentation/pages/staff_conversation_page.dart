import 'dart:async';
import 'dart:io';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design/tokens.dart';
import '../../../../core/widgets/gradient_background.dart';
import '../../../auth/presentation/controller/auth_controller.dart';
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

class _StaffConversationPageState extends ConsumerState<StaffConversationPage> {
  final _scroll = ScrollController();
  StreamSubscription<ChatMessage>? _msgSub;
  StreamSubscription<({String userId, bool online, DateTime? lastSeenAt})>?
  _presSub;

  static const _pageSize = 50;

  bool _loading = true;
  Object? _error;
  ChatThread? _thread;
  ChatThreadAccess? _access;
  List<ChatMessage> _messages = const [];
  bool _loadingOlder = false;
  bool _hasMoreOlder = true;
  bool _joining = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
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
      final detail = await api.getThread(
        idToken: token,
        threadId: widget.threadId,
      );
      final messages = await api.listMessages(
        idToken: token,
        threadId: widget.threadId,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _thread = detail.thread;
        _access = detail.access;
        _messages = messages;
        _hasMoreOlder = messages.length >= _pageSize;
        _loading = false;
      });
      // No explicit initial jump: ChatMessagesView is reverse: true so
      // pixel 0 (default scroll position) already shows the newest message.
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
    unawaited(
      _idToken().then(
        (token) => ref
            .read(chatApiProvider)
            .markRead(idToken: token, threadId: widget.threadId),
      ),
    );
  }

  void _onPresence(({String userId, bool online, DateTime? lastSeenAt}) e) {
    if (!mounted || _thread == null) return;
    final t = _thread!;
    if (t.client.id == e.userId) {
      setState(() {
        _thread = ChatThread(
          id: t.id,
          client: t.client.copyWith(online: e.online, lastSeenAt: e.lastSeenAt),
          manager: t.manager,
          lastMessageAt: t.lastMessageAt,
          lastMessagePreview: t.lastMessagePreview,
          unreadCount: t.unreadCount,
          createdAt: t.createdAt,
        );
      });
    }
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

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final pos = _scroll.position;
    // reverse: true → pixels grows as user scrolls toward older messages.
    if (pos.maxScrollExtent <= 200) return;
    if (pos.pixels > pos.maxScrollExtent - 200) {
      _loadOlder();
    }
  }

  Future<void> _loadOlder() async {
    if (_loadingOlder || !_hasMoreOlder || _messages.isEmpty) return;
    setState(() => _loadingOlder = true);
    try {
      final api = ref.read(chatApiProvider);
      final token = await _idToken();
      final older = await api.listMessages(
        idToken: token,
        threadId: widget.threadId,
        before: _messages.first.createdAt,
        limit: _pageSize,
      );
      if (!mounted) return;
      // reverse: true → prepending to chronological _messages == appending
      // to the visual top, so the user's pixel offset stays anchored to
      // the same content. No manual scroll fix-up needed.
      setState(() {
        _messages = [...older, ..._messages];
        _hasMoreOlder = older.length >= _pageSize;
        _loadingOlder = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingOlder = false);
    }
  }

  /// senior_manager / admin tapping "Присоединиться к чату" — join then
  /// re-pull access so the input replaces the button.
  Future<void> _join() async {
    if (_joining) return;
    setState(() => _joining = true);
    try {
      final api = ref.read(chatApiProvider);
      final token = await _idToken();
      await api.joinThread(idToken: token, threadId: widget.threadId);
      final detail = await api.getThread(
        idToken: token,
        threadId: widget.threadId,
      );
      if (!mounted) return;
      setState(() {
        _thread = detail.thread;
        _access = detail.access;
        _joining = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _joining = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось присоединиться к чату')),
      );
    }
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
          titleSpacing: 0,
          title: _thread == null
              ? const SizedBox.shrink()
              : InkWell(
                  onTap: () => context.push(
                    '/staff/clients/${_thread!.client.id}',
                  ),
                  child: Row(
                    children: [
                      ChatAvatar(user: _thread!.client, size: 40),
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
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                letterSpacing: -0.4,
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
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
        ),
        body: SafeArea(top: false, child: _buildBody()),
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
                  // All staff bubbles share the right side, so without a
                  // label it's not obvious which colleague sent a given
                  // message once a senior manager joins the thread.
                  // Suppress the label only on the viewer's own bubbles.
                  resolveLabel: (m) {
                    final selfId = ref.read(authProvider).value?.id;
                    if (selfId != null && m.senderId == selfId) return null;
                    final f = m.sender?.firstName.trim() ?? '';
                    return f.isEmpty ? null : f;
                  },
                ),
        ),
        if (_access?.canWrite == true)
          MessageInput(onSend: _send)
        else if (_access?.isSeniorOrAdmin == true)
          _JoinBar(loading: _joining, onJoin: _join),
      ],
    );
  }
}

/// Footer for senior_manager / admin who isn't the assigned manager —
/// mirrors the admin panel's join CTA. Tapping it posts to
/// `/chat/threads/:id/join` and the conversation refreshes; on success the
/// regular `MessageInput` takes over.
class _JoinBar extends StatelessWidget {
  final bool loading;
  final VoidCallback onJoin;
  const _JoinBar({required this.loading, required this.onJoin});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: SizedBox(
          width: double.infinity,
          height: 48,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  AppColors.yellowGradientTop,
                  AppColors.yellowGradientBottom,
                ],
              ),
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: loading ? null : onJoin,
                child: Center(
                  child: loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.purpleDark,
                          ),
                        )
                      : const Text(
                          'Присоединиться к чату',
                          style: TextStyle(
                            color: AppColors.purpleDark,
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                            letterSpacing: -0.4,
                          ),
                        ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
