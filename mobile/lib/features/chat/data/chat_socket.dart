import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../core/log.dart';
import '../../../core/network/api_provider.dart';
import '../domain/chat_models.dart';

/// Singleton Socket.IO client. Connects on demand (when the chat screen
/// subscribes via [chatSocketProvider]) and reuses the same connection across
/// screens. Reconnects through socket.io's built-in backoff when the
/// connection drops.
class ChatSocket {
  final String _baseUrl;
  io.Socket? _socket;
  String? _activeThreadId;

  final _messageNew = StreamController<ChatMessage>.broadcast();
  final _threadUpdated = StreamController<String>.broadcast();
  final _messageRead =
      StreamController<({String threadId, String userId, DateTime at})>
          .broadcast();
  final _presence =
      StreamController<({String userId, bool online, DateTime? lastSeenAt})>
          .broadcast();

  ChatSocket(this._baseUrl);

  Stream<ChatMessage> get onMessageNew => _messageNew.stream;
  Stream<String> get onThreadUpdated => _threadUpdated.stream;
  Stream<({String threadId, String userId, DateTime at})> get onMessageRead =>
      _messageRead.stream;
  Stream<({String userId, bool online, DateTime? lastSeenAt})> get onPresence =>
      _presence.stream;

  bool get isConnected => _socket?.connected ?? false;

  Future<void> connect() async {
    if (_socket != null) return;
    final user = fb.FirebaseAuth.instance.currentUser;
    if (user == null) return;
    final token = await user.getIdToken();
    if (token == null) return;
    final s = io.io(
      _baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );
    _socket = s;
    s.onConnect((_) => logd('[chat-socket] connected'));
    s.onDisconnect((_) => logd('[chat-socket] disconnected'));
    s.onConnectError((err) => logd('[chat-socket] connect error: $err'));
    s.on('message:new', (data) {
      try {
        final json = (data as Map)['message'] as Map<String, dynamic>;
        _messageNew.add(ChatMessage.fromJson(json));
      } catch (e) {
        logd('[chat-socket] bad message:new payload', e);
      }
    });
    s.on('thread:updated', (data) {
      try {
        final tid = (data as Map)['threadId'] as String;
        _threadUpdated.add(tid);
      } catch (_) {}
    });
    s.on('message:read', (data) {
      try {
        final m = data as Map;
        _messageRead.add((
          threadId: m['threadId'] as String,
          userId: m['userId'] as String,
          at: DateTime.parse(m['lastReadAt'] as String),
        ));
      } catch (_) {}
    });
    s.on('presence:update', (data) {
      try {
        final m = data as Map;
        _presence.add((
          userId: m['userId'] as String,
          online: m['online'] as bool,
          lastSeenAt: m['lastSeenAt'] != null
              ? DateTime.parse(m['lastSeenAt'] as String)
              : null,
        ));
      } catch (_) {}
    });
    s.connect();
  }

  /// Tells the server which thread is currently focused on screen so it can
  /// auto-mark messages read and skip push notifications for them.
  void focusThread(String? threadId) {
    _activeThreadId = threadId;
    final s = _socket;
    if (s == null) return;
    if (threadId == null) {
      s.emit('chat:blur');
    } else {
      s.emit('chat:focus', {'threadId': threadId});
    }
  }

  String? get activeThreadId => _activeThreadId;

  Future<void> dispose() async {
    _socket?.dispose();
    _socket = null;
    await _messageNew.close();
    await _threadUpdated.close();
    await _messageRead.close();
    await _presence.close();
  }
}

final chatSocketProvider = Provider<ChatSocket>((ref) {
  final api = ref.watch(apiClientProvider);
  final socket = ChatSocket(api.baseUrl);
  ref.onDispose(socket.dispose);
  return socket;
});
