import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/log.dart';
import '../../data/reviews_api_provider.dart';
import '../../domain/review.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

// ─────────────────────── Pending count badge ────────────────────────────────

class StaffPendingReviewsCountController extends AsyncNotifier<int> {
  Future<int> _fetch() async {
    final token = await _idToken();
    return ref.read(reviewsApiProvider).pendingCount(token);
  }

  @override
  Future<int> build() => _fetch();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_fetch);
  }
}

final staffPendingReviewsCountProvider =
    AsyncNotifierProvider<StaffPendingReviewsCountController, int>(
  StaffPendingReviewsCountController.new,
);

final hasPendingReviewsProvider = Provider<bool>((ref) {
  return (ref.watch(staffPendingReviewsCountProvider).value ?? 0) > 0;
});

// ─────────────────────── Per-tab list controller ────────────────────────────

class StaffReviewsListState {
  final List<Review> reviews;
  final String query;
  final int page;
  final int total;
  final bool loadingFirst;
  final bool loadingMore;
  final bool hasMore;
  final Object? error;

  const StaffReviewsListState({
    required this.reviews,
    required this.query,
    required this.page,
    required this.total,
    required this.loadingFirst,
    required this.loadingMore,
    required this.hasMore,
    required this.error,
  });

  const StaffReviewsListState.initial()
      : reviews = const [],
        query = '',
        page = 0,
        total = 0,
        loadingFirst = true,
        loadingMore = false,
        hasMore = false,
        error = null;

  StaffReviewsListState copyWith({
    List<Review>? reviews,
    String? query,
    int? page,
    int? total,
    bool? loadingFirst,
    bool? loadingMore,
    bool? hasMore,
    Object? error,
    bool clearError = false,
  }) {
    return StaffReviewsListState(
      reviews: reviews ?? this.reviews,
      query: query ?? this.query,
      page: page ?? this.page,
      total: total ?? this.total,
      loadingFirst: loadingFirst ?? this.loadingFirst,
      loadingMore: loadingMore ?? this.loadingMore,
      hasMore: hasMore ?? this.hasMore,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

const _searchDebounceMs = 300;
const _pageSize = 20;

/// Per-tab paginated staff reviews list. The page builds one controller per
/// status tab and shares the search query across them — flipping tabs keeps
/// the typed query.
class StaffReviewsListController extends Notifier<StaffReviewsListState> {
  StaffReviewsListController(this.status);

  final ReviewStatus status;
  Timer? _debounce;
  int _seq = 0;

  @override
  StaffReviewsListState build() {
    ref.onDispose(() => _debounce?.cancel());
    Future.microtask(refresh);
    return const StaffReviewsListState.initial();
  }

  Future<void> refresh() async {
    final mySeq = ++_seq;
    state = state.copyWith(loadingFirst: true, clearError: true);
    try {
      final token = await _idToken();
      final res = await ref.read(reviewsApiProvider).listForStaff(
            idToken: token,
            status: status,
            query: state.query.trim().isEmpty ? null : state.query.trim(),
            page: 1,
            pageSize: _pageSize,
          );
      if (mySeq != _seq) return;
      state = state.copyWith(
        reviews: res.reviews,
        page: 1,
        total: res.total,
        loadingFirst: false,
        loadingMore: false,
        hasMore: res.reviews.length < res.total,
      );
    } catch (e, st) {
      if (mySeq != _seq) return;
      logd('staff_reviews refresh failed', e, st);
      state = state.copyWith(loadingFirst: false, error: e);
    }
  }

  Future<void> loadMore() async {
    if (state.loadingFirst || state.loadingMore || !state.hasMore) return;
    final next = state.page + 1;
    final mySeq = ++_seq;
    state = state.copyWith(loadingMore: true, clearError: true);
    try {
      final token = await _idToken();
      final res = await ref.read(reviewsApiProvider).listForStaff(
            idToken: token,
            status: status,
            query: state.query.trim().isEmpty ? null : state.query.trim(),
            page: next,
            pageSize: _pageSize,
          );
      if (mySeq != _seq) return;
      final merged = [...state.reviews, ...res.reviews];
      state = state.copyWith(
        reviews: merged,
        page: next,
        total: res.total,
        loadingMore: false,
        hasMore: merged.length < res.total,
      );
    } catch (e, st) {
      if (mySeq != _seq) return;
      logd('staff_reviews loadMore failed', e, st);
      state = state.copyWith(loadingMore: false, error: e);
    }
  }

  void setQuery(String q) {
    if (state.query == q) return;
    state = state.copyWith(query: q, clearError: true);
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: _searchDebounceMs),
      refresh,
    );
  }

  /// Drop a row whose status moved out of this tab (after publish/delete).
  void removeReview(String reviewId) {
    final i = state.reviews.indexWhere((r) => r.id == reviewId);
    if (i < 0) return;
    final next = [...state.reviews]..removeAt(i);
    state = state.copyWith(
      reviews: next,
      total: state.total - 1,
      hasMore: next.length < state.total - 1,
    );
  }
}

final staffReviewsListProvider = NotifierProvider.family<
    StaffReviewsListController,
    StaffReviewsListState,
    ReviewStatus>(StaffReviewsListController.new);

// ─────────────────────── Per-client feed (detail page) ──────────────────────

/// Simple FutureProvider — the detail page shows everything for one client
/// at once (no pagination); the volume is small enough for that to be fine.
final staffClientReviewsProvider =
    FutureProvider.family<List<Review>, String>((ref, clientId) async {
  final token = await _idToken();
  final res = await ref.read(reviewsApiProvider).listForStaff(
        idToken: token,
        clientId: clientId,
        page: 1,
        pageSize: 100,
      );
  return res.reviews;
});
