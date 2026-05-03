// Wire-format data classes for the chat feature. Mirrors the backend
// serializer in web/backend/src/services/chatRepo.ts. Field renames or
// additions on either side need to be applied here as well — there's no
// codegen.

import '../../../core/domain/server_time.dart';

class ChatUserSummary {
  final String id;
  final String firstName;
  final String lastName;
  final String? avatarUrl;
  final String role;
  final bool online;
  final DateTime? lastSeenAt;

  const ChatUserSummary({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.role,
    required this.online,
    required this.lastSeenAt,
  });

  factory ChatUserSummary.fromJson(Map<String, dynamic> json) {
    return ChatUserSummary(
      id: json['id'] as String,
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String,
      online: (json['online'] as bool?) ?? false,
      lastSeenAt: parseServerTimeOpt(json['lastSeenAt'] as String?),
    );
  }

  String get fullName {
    final f = firstName.trim();
    final l = lastName.trim();
    if (f.isEmpty && l.isEmpty) return 'Пользователь';
    return '$f $l'.trim();
  }

  ChatUserSummary copyWith({bool? online, DateTime? lastSeenAt}) {
    return ChatUserSummary(
      id: id,
      firstName: firstName,
      lastName: lastName,
      avatarUrl: avatarUrl,
      role: role,
      online: online ?? this.online,
      lastSeenAt: lastSeenAt ?? this.lastSeenAt,
    );
  }
}

class ChatThread {
  final String id;
  final ChatUserSummary client;
  final ChatUserSummary? manager;
  final DateTime? lastMessageAt;
  final String? lastMessagePreview;
  final int unreadCount;
  final DateTime createdAt;

  const ChatThread({
    required this.id,
    required this.client,
    required this.manager,
    required this.lastMessageAt,
    required this.lastMessagePreview,
    required this.unreadCount,
    required this.createdAt,
  });

  factory ChatThread.fromJson(Map<String, dynamic> json) {
    return ChatThread(
      id: json['id'] as String,
      client: ChatUserSummary.fromJson(
        json['client'] as Map<String, dynamic>,
      ),
      manager: json['manager'] != null
          ? ChatUserSummary.fromJson(json['manager'] as Map<String, dynamic>)
          : null,
      lastMessageAt: parseServerTimeOpt(json['lastMessageAt'] as String?),
      lastMessagePreview: json['lastMessagePreview'] as String?,
      unreadCount: (json['unreadCount'] as int?) ?? 0,
      createdAt: parseServerTime(json['createdAt'] as String),
    );
  }
}

class ChatAttachment {
  final String url;
  final String mime;
  final String name;
  final int size;

  const ChatAttachment({
    required this.url,
    required this.mime,
    required this.name,
    required this.size,
  });

  factory ChatAttachment.fromJson(Map<String, dynamic> json) {
    return ChatAttachment(
      url: json['url'] as String,
      mime: json['mime'] as String,
      name: json['name'] as String,
      size: (json['size'] as num).toInt(),
    );
  }

  bool get isImage => mime.startsWith('image/');
  bool get isPdf => mime == 'application/pdf';
}

class ChatMessage {
  final String id;
  final String threadId;
  final String senderId;
  final ChatUserSummary? sender;
  final String? body;
  final List<ChatAttachment> attachments;
  final String kind; // 'text' | 'system'
  final DateTime createdAt;

  const ChatMessage({
    required this.id,
    required this.threadId,
    required this.senderId,
    required this.sender,
    required this.body,
    required this.attachments,
    required this.kind,
    required this.createdAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final att = (json['attachments'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ChatAttachment.fromJson)
        .toList();
    return ChatMessage(
      id: json['id'] as String,
      threadId: json['threadId'] as String,
      senderId: json['senderId'] as String,
      sender: json['sender'] != null
          ? ChatUserSummary.fromJson(json['sender'] as Map<String, dynamic>)
          : null,
      body: json['body'] as String?,
      attachments: att,
      kind: (json['kind'] as String?) ?? 'text',
      createdAt: parseServerTime(json['createdAt'] as String),
    );
  }

  bool get isSystem => kind == 'system';
}

class ChatThreadAccess {
  final bool canRead;
  final bool canWrite;
  final bool hasJoined;
  final bool isClient;
  final bool isAssignedManager;
  final bool isSeniorOrAdmin;

  const ChatThreadAccess({
    required this.canRead,
    required this.canWrite,
    required this.hasJoined,
    required this.isClient,
    required this.isAssignedManager,
    required this.isSeniorOrAdmin,
  });

  factory ChatThreadAccess.fromJson(Map<String, dynamic> json) {
    return ChatThreadAccess(
      canRead: json['canRead'] as bool? ?? false,
      canWrite: json['canWrite'] as bool? ?? false,
      hasJoined: json['hasJoined'] as bool? ?? false,
      isClient: json['isClient'] as bool? ?? false,
      isAssignedManager: json['isAssignedManager'] as bool? ?? false,
      isSeniorOrAdmin: json['isSeniorOrAdmin'] as bool? ?? false,
    );
  }
}

class SupportInfo {
  final String whatsapp;
  final String hours;

  const SupportInfo({required this.whatsapp, required this.hours});

  factory SupportInfo.fromJson(Map<String, dynamic> json) {
    return SupportInfo(
      whatsapp: (json['whatsapp'] as String?) ?? '',
      hours: (json['hours'] as String?) ?? '',
    );
  }
}
