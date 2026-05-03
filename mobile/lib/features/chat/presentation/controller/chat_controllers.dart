// Riverpod controllers for the chat feature. There are three working surfaces
// for which we keep distinct controllers — the shapes overlap but the
// reactive boundaries differ:
//
//   * clientChatProvider     — the calling client's own thread (one per user)
//   * staffThreadsProvider   — the list of threads visible to the staff user
//   * staffConversationProvider — a specific staff thread (autoDispose,
//                                 keyed by threadId)
//
// All of them subscribe to chatSocketProvider so live updates land without
// polling. Sockets are connected on demand the first time a controller spins
// up; the underlying client is reused.

import 'dart:async';
import 'dart:io';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/chat_api.dart';
import '../../data/chat_api_provider.dart';
import '../../data/chat_socket.dart';
import '../../domain/chat_models.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

class ClientChatState {
  final ChatThread? thread;
  final List<ChatMessage> messages;
  final bool initializing;
  final bool loadingOlder;
  final bool hasMoreOlder;

  const ClientChatState({
    required this.thread,
    required this.messages,
    required this.initializing,
    this.loadingOlder = false,
    this.hasMoreOlder = true,
  });

  ClientChatState copyWith({
    ChatThread? thread,
    List<ChatMessage>? messages,
    bool? initializing,
    bool? loadingOlder,
    bool? hasMoreOlder,
  }) {
    return ClientChatState(
      thread: thread ?? this.thread,
      messages: messages ?? this.messages,
      initializing: initializing ?? this.initializing,
      loadingOlder: loadingOlder ?? this.loadingOlder,
      hasMoreOlder: hasMoreOlder ?? this.hasMoreOlder,
    );
  }
}

const _chatPageSize = 50;

class ClientChatController extends AsyncNotifier<ClientChatState> {
  StreamSubscription<ChatMessage>? _msgSub;
  StreamSubscription<({String userId, bool online, DateTime? lastSeenAt})>?
      _presenceSub;

  ChatApi get _api => ref.read(chatApiProvider);
  ChatSocket get _socket => ref.read(chatSocketProvider);

  @override
  Future<ClientChatState> build() async {
    ref.onDispose(() {
      _msgSub?.cancel();
      _presenceSub?.cancel();
    });
    final token = await _idToken();
    await _socket.connect();
    final thread = await _api.getOrCreateClientThread(token);
    final messages = await _api.listMessages(
      idToken: token,
      threadId: thread.id,
      limit: _chatPageSize,
    );
    _msgSub = _socket.onMessageNew.listen(_onIncomingMessage);
    _presenceSub = _socket.onPresence.listen(_onPresence);
    _socket.focusThread(thread.id);
    // Mark caught up — entering the screen counts as reading.
    unawaited(_api.markRead(idToken: token, threadId: thread.id));
    return ClientChatState(
      thread: thread,
      messages: messages,
      initializing: false,
      hasMoreOlder: messages.length >= _chatPageSize,
    );
  }

  Future<void> loadOlder() async {
    final s = state.value;
    if (s == null || s.thread == null) return;
    if (s.loadingOlder || !s.hasMoreOlder || s.messages.isEmpty) return;
    state = AsyncData(s.copyWith(loadingOlder: true));
    try {
      final token = await _idToken();
      final older = await _api.listMessages(
        idToken: token,
        threadId: s.thread!.id,
        before: s.messages.first.createdAt,
        limit: _chatPageSize,
      );
      final cur = state.value;
      if (cur == null) return;
      state = AsyncData(cur.copyWith(
        messages: [...older, ...cur.messages],
        loadingOlder: false,
        hasMoreOlder: older.length >= _chatPageSize,
      ));
    } catch (_) {
      final cur = state.value;
      if (cur != null) {
        state = AsyncData(cur.copyWith(loadingOlder: false));
      }
    }
  }

  void _onIncomingMessage(ChatMessage m) {
    final s = state.value;
    if (s == null || s.thread == null) return;
    if (m.threadId != s.thread!.id) return;
    // Avoid duplicates if the optimistic insertion already added it.
    if (s.messages.any((x) => x.id == m.id)) return;
    state = AsyncData(s.copyWith(messages: [...s.messages, m]));
    // For the client thread, anyone other than the client themself is "them" —
    // bump the read marker since the screen is currently open.
    if (m.senderId != s.thread!.client.id) {
      unawaited(_markRead());
    }
  }

  Future<void> _markRead() async {
    final s = state.value;
    if (s == null || s.thread == null) return;
    final token = await _idToken();
    await _api.markRead(idToken: token, threadId: s.thread!.id);
  }

  void _onPresence(
      ({String userId, bool online, DateTime? lastSeenAt}) e) {
    final s = state.value;
    if (s == null || s.thread == null) return;
    final t = s.thread!;
    final manager = t.manager;
    if (manager != null && manager.id == e.userId) {
      final updated = manager.copyWith(
        online: e.online,
        lastSeenAt: e.lastSeenAt,
      );
      state = AsyncData(s.copyWith(
        thread: ChatThread(
          id: t.id,
          client: t.client,
          manager: updated,
          lastMessageAt: t.lastMessageAt,
          lastMessagePreview: t.lastMessagePreview,
          unreadCount: t.unreadCount,
          createdAt: t.createdAt,
        ),
      ));
    }
  }

  Future<void> sendMessage(String body, List<File> files) async {
    final s = state.value;
    if (s == null || s.thread == null) return;
    final token = await _idToken();
    final message = await _api.sendMessage(
      idToken: token,
      threadId: s.thread!.id,
      body: body.isEmpty ? null : body,
      files: files,
    );
    if (s.messages.any((x) => x.id == message.id)) return;
    state = AsyncData(s.copyWith(messages: [...s.messages, message]));
  }
}

final clientChatProvider =
    AsyncNotifierProvider<ClientChatController, ClientChatState>(
  ClientChatController.new,
);

// ─────────────────────────── Staff: thread list ──────────────────────────

class StaffThreadsState {
  final List<ChatThread> threads;
  final String search;
  final String filter; // all | unread | unanswered
  final String sort;   // newest | oldest | name
  final bool refreshing;

  const StaffThreadsState({
    required this.threads,
    required this.search,
    required this.filter,
    required this.sort,
    required this.refreshing,
  });

  StaffThreadsState copyWith({
    List<ChatThread>? threads,
    String? search,
    String? filter,
    String? sort,
    bool? refreshing,
  }) {
    return StaffThreadsState(
      threads: threads ?? this.threads,
      search: search ?? this.search,
      filter: filter ?? this.filter,
      sort: sort ?? this.sort,
      refreshing: refreshing ?? this.refreshing,
    );
  }
}

class StaffThreadsController extends AsyncNotifier<StaffThreadsState> {
  StreamSubscription<String>? _threadSub;
  StreamSubscription<ChatMessage>? _msgSub;

  ChatApi get _api => ref.read(chatApiProvider);
  ChatSocket get _socket => ref.read(chatSocketProvider);

  @override
  Future<StaffThreadsState> build() async {
    ref.onDispose(() {
      _threadSub?.cancel();
      _msgSub?.cancel();
    });
    await _socket.connect();
    final token = await _idToken();
    final threads = await _api.listThreads(idToken: token);
    _threadSub = _socket.onThreadUpdated.listen((_) => refresh());
    _msgSub = _socket.onMessageNew.listen((_) => refresh());
    return StaffThreadsState(
      threads: threads,
      search: '',
      filter: 'all',
      sort: 'newest',
      refreshing: false,
    );
  }

  Future<void> setSearch(String value) async {
    final s = state.value;
    if (s == null) return;
    state = AsyncData(s.copyWith(search: value, refreshing: true));
    await refresh();
  }

  Future<void> setFilter(String value) async {
    final s = state.value;
    if (s == null) return;
    state = AsyncData(s.copyWith(filter: value, refreshing: true));
    await refresh();
  }

  Future<void> setSort(String value) async {
    final s = state.value;
    if (s == null) return;
    state = AsyncData(s.copyWith(sort: value, refreshing: true));
    await refresh();
  }

  Future<void> refresh() async {
    final s = state.value;
    if (s == null) return;
    final token = await _idToken();
    final threads = await _api.listThreads(
      idToken: token,
      search: s.search.isEmpty ? null : s.search,
      filter: s.filter,
      sort: s.sort,
    );
    state = AsyncData(s.copyWith(threads: threads, refreshing: false));
  }
}

final staffThreadsProvider =
    AsyncNotifierProvider<StaffThreadsController, StaffThreadsState>(
  StaffThreadsController.new,
);

// ─────────────────────────── Total unread badge ────────────────────────────

class UnreadCountController extends AsyncNotifier<int> {
  StreamSubscription<ChatMessage>? _msgSub;
  StreamSubscription<({String threadId, String userId, DateTime at})>?
      _readSub;

  ChatApi get _api => ref.read(chatApiProvider);
  ChatSocket get _socket => ref.read(chatSocketProvider);

  @override
  Future<int> build() async {
    ref.onDispose(() {
      _msgSub?.cancel();
      _readSub?.cancel();
    });
    await _socket.connect();
    final token = await _idToken();
    _msgSub = _socket.onMessageNew.listen((_) => unawaited(refresh()));
    _readSub = _socket.onMessageRead.listen((_) => unawaited(refresh()));
    return _api.unreadCount(token);
  }

  Future<void> refresh() async {
    final token = await _idToken();
    final n = await _api.unreadCount(token);
    state = AsyncData(n);
  }
}

final unreadCountProvider =
    AsyncNotifierProvider<UnreadCountController, int>(
  UnreadCountController.new,
);
