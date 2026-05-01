import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/catalog_api.dart';
import '../../data/catalog_api_provider.dart';
import '../../domain/catalog_snapshot.dart';

final homeCatalogProvider =
    AsyncNotifierProvider<HomeController, CatalogSnapshot>(HomeController.new);

class HomeController extends AsyncNotifier<CatalogSnapshot> {
  CatalogApi get _api => ref.read(catalogApiProvider);

  @override
  Future<CatalogSnapshot> build() => _load();

  Future<CatalogSnapshot> _load() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) {
      throw StateError('No Firebase user — catalog requires auth');
    }
    final token = await fbUser.getIdToken();
    if (token == null) throw StateError('Firebase user has no ID token');
    return _api.fetchCatalog(token);
  }

  /// Pull-to-refresh entry point. Lets the RefreshIndicator own the spinner
  /// — assigning straight from `AsyncValue.guard` means the existing data
  /// stays on screen during the refetch instead of flashing empty.
  Future<void> refresh() async {
    state = await AsyncValue.guard(_load);
  }
}
