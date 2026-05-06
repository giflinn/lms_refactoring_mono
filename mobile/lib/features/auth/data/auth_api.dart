import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../../../core/domain/app_user.dart';
import '../../../core/network/api_client.dart';
import '../domain/registration_data.dart';

/// Auth-feature data layer. Instance class so it can be swapped in tests
/// (override [authApiProvider]). Uses [ApiClient] for transport — this class
/// is only responsible for endpoint semantics (which status code means what,
/// how to encode the body, how to parse the response).
class AuthApi {
  final ApiClient _client;

  AuthApi(this._client);

  Future<AppUser?> fetchMe(String idToken) async {
    final res = await _client.get('/me', idToken: idToken);
    if (res.statusCode == 404) return null;
    if (res.statusCode != 200) {
      throw HttpException('GET /me failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// Existing-user login path: hits /auth/sync without any registration data.
  /// The server returns the existing row (or 400 if the user has no DB record
  /// yet — but that shouldn't happen since registration always sends data).
  Future<AppUser> syncExisting(String idToken) async {
    final res = await _client.postJson('/auth/sync', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException(
          'POST /auth/sync failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// First-time registration path: posts the full profile (and optional
  /// avatar file) as multipart/form-data to /auth/sync.
  Future<AppUser> syncRegistration({
    required String idToken,
    required RegistrationData data,
  }) async {
    final req = http.MultipartRequest(
      'POST',
      Uri.parse('${_client.baseUrl}/auth/sync'),
    )
      ..headers['Authorization'] = 'Bearer $idToken'
      ..fields['firstName'] = data.firstName
      ..fields['lastName'] = data.lastName
      ..fields['phone'] = data.phone
      ..fields['termsAccepted'] = data.termsAccepted.toString();

    if (data.managerCode != null && data.managerCode!.isNotEmpty) {
      req.fields['managerCode'] = data.managerCode!;
    }
    if (data.avatarPath != null) {
      final file = File(data.avatarPath!);
      final ext = data.avatarPath!.toLowerCase().split('.').last;
      final mime = switch (ext) {
        'png' => MediaType('image', 'png'),
        'webp' => MediaType('image', 'webp'),
        _ => MediaType('image', 'jpeg'),
      };
      req.files.add(
        await http.MultipartFile.fromPath(
          'avatar',
          file.path,
          contentType: mime,
        ),
      );
    }

    final res = await _client.sendMultipart(req);
    if (res.statusCode != 200) {
      throw RegistrationException(
          res.statusCode, ApiClient.parseErrorCode(res.body));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return AppUser.fromJson(json['user'] as Map<String, dynamic>);
  }

  /// Returns true if [code] matches an existing manager/senior_manager/admin.
  /// Swallows network errors — the form falls back to server-side validation
  /// on submit, this is just an optimistic UI check.
  Future<bool> isManagerCodeValid(String code) async {
    try {
      final res = await _client.get('/auth/manager-code-valid?code=$code');
      if (res.statusCode != 200) return false;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return json['valid'] == true;
    } catch (_) {
      return false;
    }
  }

  Future<void> requestPasswordReset(String email) async {
    final res = await _client.postJson(
      '/auth/password-reset/request',
      body: {'email': email},
    );
    if (res.statusCode != 200) {
      throw PasswordResetException(ApiClient.parseErrorCode(res.body));
    }
  }

  Future<String> verifyResetCode({
    required String email,
    required String code,
  }) async {
    final res = await _client.postJson(
      '/auth/password-reset/verify',
      body: {'email': email, 'code': code},
    );
    if (res.statusCode != 200) {
      throw PasswordResetException(ApiClient.parseErrorCode(res.body));
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return json['resetToken'] as String;
  }

  Future<void> completePasswordReset({
    required String resetToken,
    required String newPassword,
  }) async {
    final res = await _client.postJson(
      '/auth/password-reset/complete',
      body: {'resetToken': resetToken, 'newPassword': newPassword},
    );
    if (res.statusCode != 200) {
      throw PasswordResetException(ApiClient.parseErrorCode(res.body));
    }
  }

  Future<void> requestEmailVerification(String idToken) async {
    final res = await _client.postJson(
      '/auth/email-verification/request',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw EmailVerificationException(ApiClient.parseErrorCode(res.body));
    }
  }

  Future<void> verifyEmailCode({
    required String idToken,
    required String code,
  }) async {
    final res = await _client.postJson(
      '/auth/email-verification/verify',
      idToken: idToken,
      body: {'code': code},
    );
    if (res.statusCode != 200) {
      throw EmailVerificationException(ApiClient.parseErrorCode(res.body));
    }
  }
}

class RegistrationException implements Exception {
  final int statusCode;
  final String code;
  RegistrationException(this.statusCode, this.code);
  @override
  String toString() => 'RegistrationException($statusCode, $code)';
}

class PasswordResetException implements Exception {
  final String code;
  PasswordResetException(this.code);
  @override
  String toString() => 'PasswordResetException($code)';
}

class EmailVerificationException implements Exception {
  final String code;
  EmailVerificationException(this.code);
  @override
  String toString() => 'EmailVerificationException($code)';
}
