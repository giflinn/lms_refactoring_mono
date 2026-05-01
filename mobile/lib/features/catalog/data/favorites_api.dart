import 'dart:convert';
import 'dart:io';
import '../../../core/network/api_client.dart';
import '../domain/product.dart';

/// Catalog favorites — wrapper around `/favorites*` endpoints. Lives in the
/// catalog feature because favorites *are* a view of catalog products; mobile
/// rules forbid one feature from importing another's data layer, so we keep
/// them together.
class FavoritesApi {
  final ApiClient _client;

  FavoritesApi(this._client);

  /// Lightweight set of product IDs the user has favorited. Used to know which
  /// hearts to fill on the home/detail screens without re-fetching every
  /// favorite's full payload.
  Future<Set<String>> fetchIds(String idToken) async {
    final res = await _client.get('/favorites/ids', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException(
        'GET /favorites/ids failed: ${res.statusCode} ${res.body}',
      );
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['ids'] as List).cast<String>().toSet();
  }

  /// Full product list — used by the favorites page to render with category
  /// grouping. Server already filters out inactive products.
  Future<List<Product>> fetchProducts(String idToken) async {
    final res = await _client.get('/favorites', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException(
        'GET /favorites failed: ${res.statusCode} ${res.body}',
      );
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['products'] as List)
        .cast<Map<String, dynamic>>()
        .map(Product.fromJson)
        .toList();
  }

  /// Idempotent. The composite PK + ON CONFLICT DO NOTHING means the server
  /// returns 200 even if the favorite already exists.
  Future<void> add(String idToken, String productId) async {
    final res = await _client.postJson(
      '/favorites/$productId',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
        'POST /favorites/$productId failed: ${res.statusCode} ${res.body}',
      );
    }
  }

  Future<void> remove(String idToken, String productId) async {
    final res = await _client.delete(
      '/favorites/$productId',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
        'DELETE /favorites/$productId failed: ${res.statusCode} ${res.body}',
      );
    }
  }
}
