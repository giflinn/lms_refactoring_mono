import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'api_exceptions.dart';

/// Thin wrapper around `package:http` that all feature APIs use. Owns:
/// - the base URL (resolved per-platform, overridable via --dart-define=API_URL)
/// - request timeout
/// - the auth header convention (`Authorization: Bearer <id_token>`)
/// - mapping low-level network errors to [NetworkException]
///
/// Status-code interpretation (200 vs 4xx body shapes) is left to the caller —
/// each feature decides what its endpoints' errors mean.
class ApiClient {
  static const _timeout = Duration(seconds: 15);

  final String baseUrl;
  final http.Client _http;

  ApiClient({required this.baseUrl, http.Client? client})
      : _http = client ?? http.Client();

  /// Base URL resolved at compile-time via --dart-define, with sensible
  /// per-platform defaults for the simulator/emulator.
  static String resolveBaseUrl() {
    const fromEnv = String.fromEnvironment('API_URL');
    if (fromEnv.isNotEmpty) return fromEnv;
    if (Platform.isAndroid) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  Future<http.Response> get(String path, {String? idToken}) {
    final req = http.Request('GET', _uri(path));
    req.headers.addAll(_headers(idToken));
    return _send(req);
  }

  Future<http.Response> postJson(
    String path, {
    Object? body,
    String? idToken,
  }) {
    final req = http.Request('POST', _uri(path));
    req.headers.addAll(_headers(idToken));
    req.headers['Content-Type'] = 'application/json';
    if (body != null) req.body = jsonEncode(body);
    return _send(req);
  }

  Future<http.Response> delete(String path, {String? idToken}) {
    final req = http.Request('DELETE', _uri(path));
    req.headers.addAll(_headers(idToken));
    return _send(req);
  }

  /// Caller builds the multipart request (adding fields/files), this just
  /// sends it through the same timeout/network-error handling.
  Future<http.Response> sendMultipart(http.MultipartRequest req) {
    return _send(req);
  }

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> _headers(String? idToken) => {
        if (idToken != null) 'Authorization': 'Bearer $idToken',
      };

  Future<http.Response> _send(http.BaseRequest req) async {
    try {
      final streamed = await _http.send(req).timeout(_timeout);
      return await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw const NetworkException();
    } on SocketException {
      throw const NetworkException();
    } on http.ClientException {
      throw const NetworkException();
    }
  }

  /// Tries to extract `error` from a JSON body; returns 'unknown_error' on
  /// any parse failure. Useful for translating backend error codes to UI.
  static String parseErrorCode(String body) {
    try {
      final json = jsonDecode(body) as Map<String, dynamic>;
      return (json['error'] as String?) ?? 'unknown_error';
    } catch (_) {
      return 'unknown_error';
    }
  }
}
