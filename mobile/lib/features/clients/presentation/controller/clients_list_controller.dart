import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/clients_api_provider.dart';
import '../../domain/client.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

/// Snapshot of the staff "Клиенты" list. Holds the accumulated rows across
/// pages plus the bookkeeping the UI needs (loading flags, end-of-list,
/// active query). The controller mutates this; the page just renders it.
class ClientsListState {
  final List<Client> clients;
  final String query;
  final bool loadingFirst;
  final bool loadingMore;
  final bool reachedEnd;
  final Object? error;

  const ClientsListState({
    required this.clients,
    required this.query,
    required this.loadingFirst,
    required this.loadingMore,
    required this.reachedEnd,
    required this.error,
  });

  const ClientsListState.initial()
      : clients = const [],
        query = '',
        loadingFirst = true,
        loadingMore = false,
        reachedEnd = false,
        error = null;

  ClientsListState copyWith({
    List<Client>? clients,
    String? query,
    bool? loadingFirst,
    bool? loadingMore,
    bool? reachedEnd,
    Object? error,
    bool clearError = false,
  }) {
    return ClientsListState(
      clients: clients ?? this.clients,
      query: query ?? this.query,
      loadingFirst: loadingFirst ?? this.loadingFirst,
      loadingMore: loadingMore ?? this.loadingMore,
      reachedEnd: reachedEnd ?? this.reachedEnd,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ClientsListController extends Notifier<ClientsListState> {
  static const _pageSize = 20;
  Timer? _searchDebounce;
  int _page = 0;
  int _searchSeq = 0;

  @override
  ClientsListState build() {
    ref.onDispose(() => _searchDebounce?.cancel());
    // Kick off the first page on mount.
    Future.microtask(_loadFirst);
    return const ClientsListState.initial();
  }

  Future<void> _loadFirst() async {
    final mySeq = ++_searchSeq;
    state = state.copyWith(
      loadingFirst: true,
      reachedEnd: false,
      clearError: true,
    );
    try {
      final token = await _idToken();
      final res = await ref.read(clientsApiProvider).list(
            idToken: token,
            query: state.query,
            page: 1,
            pageSize: _pageSize,
          );
      // Drop stale results — the user kept typing while we were in flight.
      if (mySeq != _searchSeq) return;
      _page = 1;
      state = state.copyWith(
        clients: res.clients,
        loadingFirst: false,
        reachedEnd: !res.hasMore,
      );
    } catch (e) {
      if (mySeq != _searchSeq) return;
      state = state.copyWith(loadingFirst: false, error: e);
    }
  }

  /// Debounced — typing rapidly fires only one request after a 300ms pause.
  /// Cancelling in-flight requests would be cleaner but our http.Client
  /// doesn't expose abort; the [_searchSeq] guard discards stale responses.
  void setQuery(String q) {
    if (q == state.query) return;
    state = state.copyWith(query: q);
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), _loadFirst);
  }

  /// Pull-to-refresh: same params, fresh first page.
  Future<void> refresh() async {
    _searchDebounce?.cancel();
    await _loadFirst();
  }

  /// Append the next page. Called from the list scroll listener when the
  /// user nears the bottom. No-op if we're already loading or out of pages.
  Future<void> loadMore() async {
    if (state.loadingFirst ||
        state.loadingMore ||
        state.reachedEnd ||
        state.error != null) {
      return;
    }
    final mySeq = _searchSeq;
    state = state.copyWith(loadingMore: true);
    try {
      final token = await _idToken();
      final res = await ref.read(clientsApiProvider).list(
            idToken: token,
            query: state.query,
            page: _page + 1,
            pageSize: ClientsListController._pageSize,
          );
      if (mySeq != _searchSeq) return;
      _page += 1;
      state = state.copyWith(
        clients: [...state.clients, ...res.clients],
        loadingMore: false,
        reachedEnd: !res.hasMore,
      );
    } catch (e) {
      if (mySeq != _searchSeq) return;
      state = state.copyWith(loadingMore: false, error: e);
    }
  }

  /// Apply an in-place edit (after a PATCH /clients/:id) so the row reflects
  /// new comment / category without a full refresh.
  void replaceClient(Client updated) {
    final idx = state.clients.indexWhere((c) => c.id == updated.id);
    if (idx == -1) return;
    final next = [...state.clients];
    next[idx] = updated;
    state = state.copyWith(clients: next);
  }
}

final clientsListProvider =
    NotifierProvider<ClientsListController, ClientsListState>(
  ClientsListController.new,
);
