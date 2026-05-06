import 'dart:convert';
import 'dart:io';
import '../../../core/network/api_client.dart';
import '../domain/telegram_link.dart';

/// Thrown by [TelegramApi.requestLinkToken]. Notable code:
///   bot_not_configured — admin hasn't connected a bot yet; mobile UI shows
///                        a "обратитесь в поддержку" fallback.
class TelegramLinkException implements Exception {
  final String code;
  final int statusCode;

  const TelegramLinkException({
    required this.code,
    required this.statusCode,
  });

  @override
  String toString() => 'TelegramLinkException($code, http=$statusCode)';
}

class TelegramApi {
  final ApiClient _client;

  TelegramApi(this._client);

  /// GET /me/telegram — current Telegram link state for the calling user.
  Future<TelegramLinkStatus> getStatus(String idToken) async {
    final res = await _client.get('/me/telegram', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /me/telegram: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return TelegramLinkStatus.fromJson(json);
  }

  /// POST /me/telegram/link-token — generates a single-use deep-link token
  /// + the full t.me URL the mobile UI passes to url_launcher.
  Future<TelegramLinkToken> requestLinkToken(String idToken) async {
    final res = await _client.postJson(
      '/me/telegram/link-token',
      idToken: idToken,
      body: const {},
    );
    if (res.statusCode == 200) {
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return TelegramLinkToken.fromJson(json);
    }
    throw TelegramLinkException(
      code: ApiClient.parseErrorCode(res.body),
      statusCode: res.statusCode,
    );
  }

  /// POST /me/telegram/unlink — kicks the user from every active group, then
  /// clears the link. Idempotent.
  Future<void> unlink(String idToken) async {
    final res = await _client.postJson(
      '/me/telegram/unlink',
      idToken: idToken,
      body: const {},
    );
    if (res.statusCode != 200) {
      throw HttpException('POST /me/telegram/unlink: ${res.statusCode}');
    }
  }
}
