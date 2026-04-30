import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'auth_state.dart';

class AuthApi {
  static String get baseUrl {
    const fromEnv = String.fromEnvironment('API_URL');
    if (fromEnv.isNotEmpty) return fromEnv;
    if (Platform.isAndroid) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  static Future<AppUser?> fetchMe(String idToken) async {
    final res = await http.get(
      Uri.parse('$baseUrl/me'),
      headers: {'Authorization': 'Bearer $idToken'},
    );
    if (res.statusCode == 404) return null;
    if (res.statusCode != 200) {
      throw HttpException('GET /me failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  static Future<AppUser> syncUser(String idToken) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/sync'),
      headers: {'Authorization': 'Bearer $idToken'},
    );
    if (res.statusCode != 200) {
      throw HttpException('POST /auth/sync failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }
}
