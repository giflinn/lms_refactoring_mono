import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'auth_state.dart';

/// Thrown when the request never reaches the server (no network, server down,
/// wrong API_URL on a real device). Pages catch this to show a clear "проверьте
/// соединение" message instead of a generic error.
class NetworkException implements Exception {
  const NetworkException();
}

const _httpTimeout = Duration(seconds: 15);

Future<T> _withNetworkErrors<T>(Future<T> Function() request) async {
  try {
    return await request();
  } on TimeoutException {
    throw const NetworkException();
  } on SocketException {
    throw const NetworkException();
  } on http.ClientException {
    throw const NetworkException();
  }
}

class AuthApi {
  static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_URL');
    if (fromEnv.isNotEmpty) return fromEnv;
    if (Platform.isAndroid) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  static Map<String, String> _authHeader(String idToken) => {
        'Authorization': 'Bearer $idToken',
      };

  static Future<AppUser?> fetchMe(String idToken) => _withNetworkErrors(() async {
        final res = await http
            .get(
              Uri.parse('$baseUrl/me'),
              headers: _authHeader(idToken),
            )
            .timeout(_httpTimeout);
        if (res.statusCode == 404) return null;
        if (res.statusCode != 200) {
          throw HttpException('GET /me failed: ${res.statusCode} ${res.body}');
        }
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        return AppUser.fromJson(data['user'] as Map<String, dynamic>);
      });

  /// Existing-user login path: hits /auth/sync without any registration data.
  /// The server returns the existing row (or 400 if the user has no DB record
  /// yet — but that shouldn't happen since registration always sends data).
  static Future<AppUser> syncExisting(String idToken) => _withNetworkErrors(() async {
        final res = await http
            .post(
              Uri.parse('$baseUrl/auth/sync'),
              headers: _authHeader(idToken),
            )
            .timeout(_httpTimeout);
        if (res.statusCode != 200) {
          throw HttpException(
              'POST /auth/sync failed: ${res.statusCode} ${res.body}');
        }
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        return AppUser.fromJson(data['user'] as Map<String, dynamic>);
      });

  /// First-time registration path: posts the full profile (and optional
  /// avatar file) as multipart/form-data to /auth/sync.
  static Future<AppUser> syncRegistration({
    required String idToken,
    required RegistrationData data,
  }) =>
      _withNetworkErrors(() async {
        final req =
            http.MultipartRequest('POST', Uri.parse('$baseUrl/auth/sync'))
              ..headers.addAll(_authHeader(idToken))
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

        final streamed = await req.send().timeout(_httpTimeout);
        final res = await http.Response.fromStream(streamed);
        if (res.statusCode != 200) {
          throw RegistrationException(res.statusCode, _parseError(res.body));
        }
        final json = jsonDecode(res.body) as Map<String, dynamic>;
        return AppUser.fromJson(json['user'] as Map<String, dynamic>);
      });

  /// Returns true if [code] matches an existing manager/senior_manager/admin.
  static Future<bool> isManagerCodeValid(String code) async {
    try {
      final res = await http
          .get(Uri.parse('$baseUrl/auth/manager-code-valid?code=$code'))
          .timeout(_httpTimeout);
      if (res.statusCode != 200) return false;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return json['valid'] == true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> requestPasswordReset(String email) =>
      _withNetworkErrors(() async {
        final res = await http
            .post(
              Uri.parse('$baseUrl/auth/password-reset/request'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'email': email}),
            )
            .timeout(_httpTimeout);
        if (res.statusCode != 200) {
          throw PasswordResetException(_parseError(res.body));
        }
      });

  static Future<String> verifyResetCode({
    required String email,
    required String code,
  }) =>
      _withNetworkErrors(() async {
        final res = await http
            .post(
              Uri.parse('$baseUrl/auth/password-reset/verify'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'email': email, 'code': code}),
            )
            .timeout(_httpTimeout);
        if (res.statusCode != 200) {
          throw PasswordResetException(_parseError(res.body));
        }
        final json = jsonDecode(res.body) as Map<String, dynamic>;
        return json['resetToken'] as String;
      });

  static Future<void> completePasswordReset({
    required String resetToken,
    required String newPassword,
  }) =>
      _withNetworkErrors(() async {
        final res = await http
            .post(
              Uri.parse('$baseUrl/auth/password-reset/complete'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({
                'resetToken': resetToken,
                'newPassword': newPassword,
              }),
            )
            .timeout(_httpTimeout);
        if (res.statusCode != 200) {
          throw PasswordResetException(_parseError(res.body));
        }
      });

  static String _parseError(String body) {
    try {
      final json = jsonDecode(body) as Map<String, dynamic>;
      return (json['error'] as String?) ?? 'unknown_error';
    } catch (_) {
      return 'unknown_error';
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
