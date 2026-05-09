import 'dart:convert';
import 'dart:io';

import '../../../core/network/api_client.dart';

/// One legal document fetched by slug. Mobile only ever requests one of
/// 'about' | 'privacy' | 'terms' | 'offer' — backend treats other slugs as
/// 404. Endpoint is public (no Authorization header) so the documents can
/// render before sign-in (e.g. registration consent).
class LegalDocument {
  final String slug;
  final String title;
  final String contentHtml;
  final DateTime updatedAt;

  const LegalDocument({
    required this.slug,
    required this.title,
    required this.contentHtml,
    required this.updatedAt,
  });

  factory LegalDocument.fromJson(Map<String, dynamic> json) {
    return LegalDocument(
      slug: json['slug'] as String,
      title: json['title'] as String,
      contentHtml: (json['contentHtml'] as String?) ?? '',
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

class LegalApi {
  final ApiClient _client;

  LegalApi(this._client);

  Future<LegalDocument> get(String slug) async {
    final res = await _client.get('/legal/$slug');
    if (res.statusCode != 200) {
      throw HttpException('GET /legal/$slug: ${res.statusCode}');
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return LegalDocument.fromJson(body['document'] as Map<String, dynamic>);
  }
}
