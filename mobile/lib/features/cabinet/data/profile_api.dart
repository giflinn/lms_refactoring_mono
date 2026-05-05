import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../../../core/domain/app_user.dart';
import '../../../core/network/api_client.dart';

/// Backend rejection of a `PATCH /me` request. `code` carries the snake_case
/// machine-readable error string the page maps to a per-field message.
class ProfileUpdateException implements Exception {
  final int statusCode;
  final String code;
  ProfileUpdateException(this.statusCode, this.code);

  @override
  String toString() => 'ProfileUpdateException($statusCode, $code)';
}

class ProfileApi {
  final ApiClient _client;
  ProfileApi(this._client);

  /// Partial profile update via multipart `PATCH /me`. Only non-null fields are
  /// sent — null params mean "leave unchanged" server-side. [avatarLocalPath]
  /// is a path on disk pointing at the picked image (no remote URL).
  Future<AppUser> updateProfile({
    required String idToken,
    String? firstName,
    String? lastName,
    String? phone,
    String? birthDate,
    String? avatarLocalPath,
  }) async {
    final req = http.MultipartRequest(
      'PATCH',
      Uri.parse('${_client.baseUrl}/me'),
    )..headers['Authorization'] = 'Bearer $idToken';

    if (firstName != null) req.fields['firstName'] = firstName;
    if (lastName != null) req.fields['lastName'] = lastName;
    if (phone != null) req.fields['phone'] = phone;
    if (birthDate != null) req.fields['birthDate'] = birthDate;

    if (avatarLocalPath != null) {
      final ext = avatarLocalPath.toLowerCase().split('.').last;
      final mime = switch (ext) {
        'png' => MediaType('image', 'png'),
        'webp' => MediaType('image', 'webp'),
        _ => MediaType('image', 'jpeg'),
      };
      req.files.add(
        await http.MultipartFile.fromPath(
          'avatar',
          File(avatarLocalPath).path,
          contentType: mime,
        ),
      );
    }

    final res = await _client.sendMultipart(req);
    if (res.statusCode != 200) {
      throw ProfileUpdateException(
        res.statusCode,
        ApiClient.parseErrorCode(res.body),
      );
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return AppUser.fromJson(json['user'] as Map<String, dynamic>);
  }
}
