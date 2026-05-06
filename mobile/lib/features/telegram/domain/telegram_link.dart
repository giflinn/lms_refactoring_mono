/// Whether the calling user has a linked Telegram identity. When [linked] is
/// false the other fields are null. When true at least [telegramUserId] is
/// set; the rest may still be null if the bot didn't have first_name /
/// username at link time (older accounts).
class TelegramLinkStatus {
  final bool linked;
  final String? telegramUserId;
  final String? telegramUsername;
  final String? telegramFirstName;
  final DateTime? telegramLinkedAt;

  const TelegramLinkStatus({
    required this.linked,
    required this.telegramUserId,
    required this.telegramUsername,
    required this.telegramFirstName,
    required this.telegramLinkedAt,
  });

  const TelegramLinkStatus.notLinked()
      : linked = false,
        telegramUserId = null,
        telegramUsername = null,
        telegramFirstName = null,
        telegramLinkedAt = null;

  factory TelegramLinkStatus.fromJson(Map<String, dynamic> json) {
    final linked = json['linked'] as bool? ?? false;
    if (!linked) return const TelegramLinkStatus.notLinked();
    return TelegramLinkStatus(
      linked: true,
      telegramUserId: json['telegramUserId'] as String?,
      telegramUsername: json['telegramUsername'] as String?,
      telegramFirstName: json['telegramFirstName'] as String?,
      telegramLinkedAt: (json['telegramLinkedAt'] as String?) != null
          ? DateTime.parse(json['telegramLinkedAt'] as String)
          : null,
    );
  }
}

/// Server-issued single-use deep-link token + the full t.me URL the mobile
/// hands to url_launcher.
class TelegramLinkToken {
  final String token;
  final String deepLink;
  final String botUsername;
  final DateTime expiresAt;

  const TelegramLinkToken({
    required this.token,
    required this.deepLink,
    required this.botUsername,
    required this.expiresAt,
  });

  factory TelegramLinkToken.fromJson(Map<String, dynamic> json) {
    return TelegramLinkToken(
      token: json['token'] as String,
      deepLink: json['deepLink'] as String,
      botUsername: json['botUsername'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }
}
