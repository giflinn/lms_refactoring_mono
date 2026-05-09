import 'dart:convert';

import '../../../core/network/api_client.dart';

/// Resolved Kaspi link for the current client. The backend picks the URL
/// based on the global strategy (single / per_group) and the client's
/// manager assignment. Returns null on any non-success response so the
/// caller can fall back to the legacy hardcoded https://kaspi.kz instead
/// of dead-ending the user mid-checkout.
class ResolvedKaspiLink {
  final String url;
  final String label;

  const ResolvedKaspiLink({required this.url, required this.label});

  factory ResolvedKaspiLink.fromJson(Map<String, dynamic> json) {
    return ResolvedKaspiLink(
      url: json['url'] as String,
      label: (json['label'] as String?) ?? '',
    );
  }
}

class KaspiApi {
  final ApiClient _client;

  KaspiApi(this._client);

  /// Returns the URL to open after order creation, or null if the backend
  /// has nothing configured / the request fails. Network exceptions are
  /// swallowed and surfaced as null — payment shouldn't blow up on
  /// connectivity hiccups.
  Future<ResolvedKaspiLink?> resolve(String idToken) async {
    try {
      final res = await _client.get('/me/kaspi-link', idToken: idToken);
      if (res.statusCode != 200) return null;
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      return ResolvedKaspiLink.fromJson(body);
    } catch (_) {
      return null;
    }
  }
}
