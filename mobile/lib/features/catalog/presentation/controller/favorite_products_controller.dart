import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/favorites_api.dart';
import '../../data/favorites_api_provider.dart';
import '../../domain/product.dart';

/// Full list of products the user has favorited, in reverse-chronological
/// order (newest favorite first per the server). Watched only by the
/// favorites page. The ids controller invalidates this on every toggle, so
/// the list refetches on the next view — cheaper than wiring optimistic
/// inserts/removes through two providers.
final favoriteProductsProvider =
    AsyncNotifierProvider<FavoriteProductsController, List<Product>>(
  FavoriteProductsController.new,
);

class FavoriteProductsController extends AsyncNotifier<List<Product>> {
  FavoritesApi get _api => ref.read(favoritesApiProvider);

  @override
  Future<List<Product>> build() => _load();

  Future<List<Product>> _load() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) {
      throw StateError('No Firebase user — favorites require auth');
    }
    final token = await fbUser.getIdToken();
    if (token == null) throw StateError('Firebase user has no ID token');
    return _api.fetchProducts(token);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_load);
  }

  /// Drop [productId] from the cached list without going to the server. Used
  /// by [FavoriteIdsController.toggle] for optimistic UI: the swipe-to-delete
  /// `Dismissible` requires the item to disappear from the source list before
  /// the next rebuild, otherwise it asserts on a duplicate key.
  void dropLocally(String productId) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.where((p) => p.id != productId).toList(growable: false),
    );
  }
}
