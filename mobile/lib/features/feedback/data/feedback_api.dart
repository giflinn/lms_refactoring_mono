import 'dart:io';

import '../../../core/network/api_client.dart';

/// Error returned by POST /me/feedback. Notable codes:
/// - `message_required` — empty body after trim.
/// - `message_too_long` — server cap is 5000 chars.
class FeedbackSubmitException implements Exception {
  final String code;
  final int statusCode;

  const FeedbackSubmitException({
    required this.code,
    required this.statusCode,
  });

  @override
  String toString() => 'FeedbackSubmitException($code, http=$statusCode)';
}

class FeedbackApi {
  final ApiClient _client;

  FeedbackApi(this._client);

  /// POST /me/feedback. [platform] is 'ios' or 'android'; [appVersion] is
  /// `package_info_plus`'s `version`. Both are best-effort meta — the server
  /// stores nulls if unknown.
  Future<void> submit({
    required String idToken,
    required String message,
    String? platform,
    String? appVersion,
  }) async {
    final body = <String, Object>{
      'message': message.trim(),
      if (platform != null) 'platform': platform,
      if (appVersion != null) 'appVersion': appVersion,
    };
    final res = await _client.postJson(
      '/me/feedback',
      idToken: idToken,
      body: body,
    );
    if (res.statusCode == 201) return;
    if (res.statusCode >= 400 && res.statusCode < 500) {
      throw FeedbackSubmitException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
    throw HttpException('POST /me/feedback: ${res.statusCode}');
  }
}
