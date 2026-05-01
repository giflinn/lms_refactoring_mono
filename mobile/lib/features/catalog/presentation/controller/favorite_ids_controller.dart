import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/favorites_api.dart';
import '../../data/favorites_api_provider.dart';
import 'favorite_products_controller.dart';

/// Set of product IDs the authenticated user has favorited. Used by every
/// product-aware view (detail page, future home cards) to render the heart
/// in the correct state. Toggling is optimistic: the local set updates
/// immediately, then syncs with the server; on network failure the set is
/// reverted and the caller can show a snackbar.
final favoriteIdsProvider =
    AsyncNotifierProvider<FavoriteIdsController, Set<String>>(
  FavoriteIdsController.new,
);

class FavoriteIdsController extends AsyncNotifier<Set<String>> {
  FavoritesApi get _api => ref.read(favoritesApiProvider);

  @override
  Future<Set<String>> build() => _load();

  Future<Set<String>> _load() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) {
      throw StateError('No Firebase user — favorites require auth');
    }
    final token = await fbUser.getIdToken();
    if (token == null) throw StateError('Firebase user has no ID token');
    return _api.fetchIds(token);
  }

  /// Toggle membership for [productId]. Updates local state synchronously,
  /// then sends the matching POST/DELETE. Throws on network failure after
  /// reverting state — the caller is expected to show a snackbar.
  Future<void> toggle(String productId) async {
    final current = state.value ?? const <String>{};
    final adding = !current.contains(productId);
    final next = Set<String>.from(current);
    if (adding) {
      next.add(productId);
    } else {
      next.remove(productId);
    }
    state = AsyncData(next);

    // On remove, also drop the row from the favorites page's cached list so
    // the swipe-to-delete animation doesn't fight a stale source. Add is
    // different — we don't have the full product object here, so we just
    // invalidate after the API call to force a refetch on next view.
    if (!adding) {
      ref.read(favoriteProductsProvider.notifier).dropLocally(productId);
    }

    try {
      final fbUser = fb.FirebaseAuth.instance.currentUser;
      if (fbUser == null) throw StateError('Auth required');
      final token = await fbUser.getIdToken();
      if (token == null) throw StateError('No ID token');
      if (adding) {
        await _api.add(token, productId);
        ref.invalidate(favoriteProductsProvider);
      } else {
        await _api.remove(token, productId);
      }
    } catch (e) {
      state = AsyncData(current);
      // Refetch to recover the optimistically-removed product.
      if (!adding) {
        ref.invalidate(favoriteProductsProvider);
      }
      rethrow;
    }
  }

  /// Synchronous membership check used inside widgets that already have a
  /// product id and don't want to re-watch the AsyncValue.
  bool isFavorite(String productId) {
    final s = state.value;
    return s != null && s.contains(productId);
  }
}
