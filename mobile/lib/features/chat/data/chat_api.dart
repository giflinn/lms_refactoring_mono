import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../../../core/network/api_client.dart';
import '../domain/chat_models.dart';

/// Maps a file path to one of the chat-supported MIME types. We keep this
/// lookup local — the package:mime dependency isn't worth pulling in for the
/// handful of formats the chat API accepts.
String _mimeForPath(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

class ChatApi {
  final ApiClient _client;

  ChatApi(this._client);

  /// Build a full URL for a relative attachment path.
  String resolveFileUrl(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '${_client.baseUrl}$path';
  }

  /// POST /chat/threads/me — get-or-create the caller's thread (client only).
  Future<ChatThread> getOrCreateClientThread(String idToken) async {
    final res = await _client.postJson('/chat/threads/me', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('POST /chat/threads/me: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ChatThread.fromJson(json['thread'] as Map<String, dynamic>);
  }

  /// senior_manager / admin only — start participating in a thread they
  /// don't own. Idempotent server-side. After this returns, a fresh
  /// `getThread()` will report `access.canWrite=true`.
  Future<void> joinThread({
    required String idToken,
    required String threadId,
  }) async {
    final res = await _client.postJson(
      '/chat/threads/$threadId/join',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
        'POST /chat/threads/$threadId/join: ${res.statusCode}',
      );
    }
  }

  /// Staff-only: get-or-create the thread for [clientId] and return its id.
  /// Used by the "Клиенты" → client profile chat icon. Throws on non-200
  /// (404 = client_not_found, 403 = manager doesn't own this client).
  Future<String> openThreadWithClient({
    required String idToken,
    required String clientId,
  }) async {
    final res = await _client.postJson(
      '/chat/threads/by-client/$clientId',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
        'POST /chat/threads/by-client/$clientId: ${res.statusCode}',
      );
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return json['threadId'] as String;
  }

  /// GET /chat/threads — staff list with optional search/filter/sort.
  Future<List<ChatThread>> listThreads({
    required String idToken,
    String? search,
    String filter = 'all',
    String? managerId,
    String sort = 'newest',
  }) async {
    final qp = <String>[];
    if (search != null && search.isNotEmpty) {
      qp.add('search=${Uri.encodeQueryComponent(search)}');
    }
    if (filter != 'all') qp.add('filter=$filter');
    if (managerId != null) qp.add('managerId=$managerId');
    if (sort != 'newest') qp.add('sort=$sort');
    final path =
        '/chat/threads${qp.isEmpty ? '' : '?${qp.join('&')}'}';
    final res = await _client.get(path, idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET $path: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['threads'] as List)
        .cast<Map<String, dynamic>>()
        .map(ChatThread.fromJson)
        .toList();
  }

  Future<({ChatThread thread, ChatThreadAccess access})> getThread({
    required String idToken,
    required String threadId,
  }) async {
    final res = await _client.get(
      '/chat/threads/$threadId',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException('GET /chat/threads/$threadId: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (
      thread: ChatThread.fromJson(json['thread'] as Map<String, dynamic>),
      access: ChatThreadAccess.fromJson(
        json['access'] as Map<String, dynamic>,
      ),
    );
  }

  Future<List<ChatMessage>> listMessages({
    required String idToken,
    required String threadId,
    DateTime? before,
    int limit = 50,
  }) async {
    final qp = <String>['limit=$limit'];
    if (before != null) {
      qp.add('before=${Uri.encodeQueryComponent(before.toIso8601String())}');
    }
    final res = await _client.get(
      '/chat/threads/$threadId/messages?${qp.join('&')}',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
          'GET /chat/threads/$threadId/messages: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['messages'] as List)
        .cast<Map<String, dynamic>>()
        .map(ChatMessage.fromJson)
        .toList();
  }

  Future<ChatMessage> sendMessage({
    required String idToken,
    required String threadId,
    String? body,
    List<File> files = const [],
  }) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('${_client.baseUrl}/chat/threads/$threadId/messages'),
    );
    req.headers['Authorization'] = 'Bearer $idToken';
    if (body != null && body.isNotEmpty) {
      req.fields['body'] = body;
    }
    for (final f in files) {
      final mime = _mimeForPath(f.path);
      final parts = mime.split('/');
      req.files.add(await http.MultipartFile.fromPath(
        'files',
        f.path,
        contentType: MediaType(parts[0], parts.length > 1 ? parts[1] : ''),
      ));
    }
    final res = await _client.sendMultipart(req);
    if (res.statusCode != 201) {
      throw HttpException(
          'POST /chat/threads/$threadId/messages: ${res.statusCode} ${res.body}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ChatMessage.fromJson(json['message'] as Map<String, dynamic>);
  }

  Future<void> markRead({
    required String idToken,
    required String threadId,
  }) async {
    final res = await _client.postJson(
      '/chat/threads/$threadId/read',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
          'POST /chat/threads/$threadId/read: ${res.statusCode}');
    }
  }

  Future<int> unreadCount(String idToken) async {
    final res = await _client.get('/chat/unread-count', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /chat/unread-count: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['count'] as num).toInt();
  }

  Future<SupportInfo> fetchSupportInfo() async {
    final res = await _client.get('/support/info');
    if (res.statusCode != 200) {
      throw HttpException('GET /support/info: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return SupportInfo.fromJson(json);
  }

  Future<void> registerFcmToken({
    required String idToken,
    required String token,
    required String platform,
  }) async {
    final res = await _client.postJson(
      '/me/fcm-tokens',
      idToken: idToken,
      body: {'token': token, 'platform': platform},
    );
    if (res.statusCode != 200) {
      throw HttpException('POST /me/fcm-tokens: ${res.statusCode}');
    }
  }

  Future<void> deleteFcmToken({
    required String idToken,
    required String token,
  }) async {
    // Best-effort — we don't surface the status. If the token was already
    // unknown to the server, that's still effectively success.
    await _client.deleteJson(
      '/me/fcm-tokens',
      idToken: idToken,
      body: {'token': token},
    );
  }
}
