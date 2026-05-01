import 'dart:convert';
import 'dart:io';
import '../../../core/network/api_client.dart';
import '../domain/catalog_snapshot.dart';
import '../domain/product.dart';

/// Catalog data layer. All endpoints sit behind `requireAuth` on the backend
/// (no role check) — any signed-in user can call them.
class CatalogApi {
  final ApiClient _client;

  CatalogApi(this._client);

  /// Build a full URL for a relative cover path. Returns null if [path] is
  /// null or already absolute. Stays here so the widgets don't import
  /// [ApiClient].
  String? resolveCoverUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '${_client.baseUrl}$path';
  }

  Future<CatalogSnapshot> fetchCatalog(String idToken) async {
    final res = await _client.get('/catalog', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /catalog failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return CatalogSnapshot(
      categories: (data['categories'] as List)
          .cast<Map<String, dynamic>>()
          .map(CatalogCategory.fromJson)
          .toList(),
      products: (data['products'] as List)
          .cast<Map<String, dynamic>>()
          .map(Product.fromJson)
          .toList(),
    );
  }

  Future<List<Product>> search(String idToken, String query) async {
    final q = Uri.encodeQueryComponent(query);
    final res = await _client.get('/catalog/search?q=$q', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException(
          'GET /catalog/search failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['products'] as List)
        .cast<Map<String, dynamic>>()
        .map(Product.fromJson)
        .toList();
  }

  Future<List<Product>> topSearch(String idToken) async {
    final res = await _client.get('/catalog/top-search', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException(
          'GET /catalog/top-search failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['products'] as List)
        .cast<Map<String, dynamic>>()
        .map(Product.fromJson)
        .toList();
  }
}
