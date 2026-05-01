import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/log.dart';
import '../../data/catalog_api.dart';
import '../../data/catalog_api_provider.dart';
import '../../domain/product.dart';

const _debounce = Duration(milliseconds: 300);

class SearchState {
  final String query;
  // [results] is null while idle (empty query) — different from "search ran
  // and returned []" which we represent with an empty list.
  final List<Product>? results;
  final bool loading;
  final Object? error;

  const SearchState({
    required this.query,
    required this.results,
    required this.loading,
    required this.error,
  });

  const SearchState.initial()
      : query = '',
        results = null,
        loading = false,
        error = null;

  SearchState copyWith({
    String? query,
    Object? results = _sentinel,
    bool? loading,
    Object? error = _sentinel,
  }) {
    return SearchState(
      query: query ?? this.query,
      results: identical(results, _sentinel)
          ? this.results
          : results as List<Product>?,
      loading: loading ?? this.loading,
      error: identical(error, _sentinel) ? this.error : error,
    );
  }
}

const _sentinel = Object();

final searchControllerProvider =
    NotifierProvider<SearchController, SearchState>(SearchController.new);

/// Drives the search screen. Owns:
/// - the live query string
/// - debounced backend calls (300 ms after last keystroke)
/// - the popular fallback (lazy-loaded once on screen open)
///
/// `autoDispose` so leaving and re-entering the search screen starts clean.
class SearchController extends Notifier<SearchState> {
  CatalogApi get _api => ref.read(catalogApiProvider);

  Timer? _debounceTimer;
  int _requestSeq = 0;

  @override
  SearchState build() {
    ref.onDispose(() {
      _debounceTimer?.cancel();
    });
    return const SearchState.initial();
  }

  Future<String?> _idToken() async {
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) return null;
    return fbUser.getIdToken();
  }

  void onQueryChanged(String raw) {
    final query = raw.trim();
    state = state.copyWith(query: raw);

    _debounceTimer?.cancel();
    if (query.isEmpty) {
      // Cancel any in-flight request — empty query means "show only popular".
      state = state.copyWith(results: null, loading: false, error: null);
      return;
    }

    state = state.copyWith(loading: true, error: null);
    _debounceTimer = Timer(_debounce, () => _runSearch(query));
  }

  Future<void> _runSearch(String query) async {
    final mySeq = ++_requestSeq;
    try {
      final token = await _idToken();
      if (token == null) {
        if (mySeq != _requestSeq) return;
        state = state.copyWith(loading: false, error: 'no_auth');
        return;
      }
      final results = await _api.search(token, query);
      // Drop stale responses: a newer keystroke already kicked off another
      // request, no point overwriting newer state with older data.
      if (mySeq != _requestSeq) return;
      state = state.copyWith(results: results, loading: false, error: null);
    } catch (e, st) {
      logd('search failed', e, st);
      if (mySeq != _requestSeq) return;
      state = state.copyWith(loading: false, error: e);
    }
  }

  /// Force-refire search for the current query. Used when the user pulls to
  /// retry after an error.
  void retry() {
    final q = state.query.trim();
    if (q.isEmpty) return;
    state = state.copyWith(loading: true, error: null);
    _runSearch(q);
  }
}

/// Popular products — loaded once when the search screen mounts. Auto-disposed
/// alongside the search screen so we don't accumulate stale lists across
/// open/close cycles.
final popularProductsProvider =
    FutureProvider.autoDispose<List<Product>>((ref) async {
  final api = ref.watch(catalogApiProvider);
  final fbUser = fb.FirebaseAuth.instance.currentUser;
  if (fbUser == null) return [];
  final token = await fbUser.getIdToken();
  if (token == null) return [];
  return api.topSearch(token);
});
