import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/log.dart';
import '../../data/cancellations_api_provider.dart';
import '../../domain/cancellation.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

const _pageSize = 20;
const _searchDebounceMs = 350;

class StaffCancellationsListState {
  final List<StaffCancellation> rows;
  final CancellationStatus tab;
  final String query;
  final int page;
  final int total;
  final bool loadingFirst;
  final bool loadingMore;
  final bool hasMore;
  final Object? error;

  const StaffCancellationsListState({
    required this.rows,
    required this.tab,
    required this.query,
    required this.page,
    required this.total,
    required this.loadingFirst,
    required this.loadingMore,
    required this.hasMore,
    required this.error,
  });

  factory StaffCancellationsListState.initial(CancellationStatus tab) =>
      StaffCancellationsListState(
        rows: const [],
        tab: tab,
        query: '',
        page: 1,
        total: 0,
        loadingFirst: false,
        loadingMore: false,
        hasMore: false,
        error: null,
      );

  StaffCancellationsListState copyWith({
    List<StaffCancellation>? rows,
    String? query,
    int? page,
    int? total,
    bool? loadingFirst,
    bool? loadingMore,
    bool? hasMore,
    Object? error,
    bool clearError = false,
  }) {
    return StaffCancellationsListState(
      rows: rows ?? this.rows,
      tab: tab,
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

/// Paginated cancellations list, keyed by status tab. Same shape as
/// StaffOrdersListController — search field is shared across tabs and
/// flipping a tab keeps that tab's scroll/results.
class StaffCancellationsListController
    extends Notifier<StaffCancellationsListState> {
  StaffCancellationsListController(this.tab);

  final CancellationStatus tab;

  Timer? _searchDebounce;
  int _requestSeq = 0;

  @override
  StaffCancellationsListState build() {
    ref.onDispose(() => _searchDebounce?.cancel());
    Future.microtask(refresh);
    return StaffCancellationsListState.initial(tab);
  }

  Future<void> refresh() async {
    final seq = ++_requestSeq;
    state = state.copyWith(loadingFirst: true, clearError: true);
    try {
      final token = await _idToken();
      final res = await ref.read(cancellationsApiProvider).listForStaff(
            idToken: token,
            query: state.query.trim().isEmpty ? null : state.query.trim(),
            page: 1,
            pageSize: _pageSize,
            status: tab,
          );
      if (seq != _requestSeq) return;
      state = state.copyWith(
        rows: res.cancellations,
        page: 1,
        total: res.total,
        loadingFirst: false,
        loadingMore: false,
        hasMore: res.cancellations.length < res.total,
      );
    } catch (e, st) {
      if (seq != _requestSeq) return;
      logd('staff_cancellations refresh failed', e, st);
      state = state.copyWith(loadingFirst: false, error: e);
    }
  }

  Future<void> loadMore() async {
    if (state.loadingMore || state.loadingFirst || !state.hasMore) return;
    final nextPage = state.page + 1;
    final seq = ++_requestSeq;
    state = state.copyWith(loadingMore: true, clearError: true);
    try {
      final token = await _idToken();
      final res = await ref.read(cancellationsApiProvider).listForStaff(
            idToken: token,
            query: state.query.trim().isEmpty ? null : state.query.trim(),
            page: nextPage,
            pageSize: _pageSize,
            status: tab,
          );
      if (seq != _requestSeq) return;
      final merged = [...state.rows, ...res.cancellations];
      state = state.copyWith(
        rows: merged,
        page: nextPage,
        total: res.total,
        loadingMore: false,
        hasMore: merged.length < res.total,
      );
    } catch (e, st) {
      if (seq != _requestSeq) return;
      logd('staff_cancellations loadMore failed', e, st);
      state = state.copyWith(loadingMore: false, error: e);
    }
  }

  void setQuery(String value) {
    if (state.query == value) return;
    state = state.copyWith(query: value, clearError: true);
    _searchDebounce?.cancel();
    _searchDebounce = Timer(
      const Duration(milliseconds: _searchDebounceMs),
      refresh,
    );
  }

  /// After a decision lands, drop the row from the `requested` tab so the
  /// list matches reality on back-navigation. The decided tab will fetch
  /// fresh on its next refresh.
  void removeRow(String cancellationId) {
    final i = state.rows.indexWhere((c) => c.id == cancellationId);
    if (i < 0) return;
    final updated = [...state.rows]..removeAt(i);
    state = state.copyWith(
      rows: updated,
      total: state.total - 1,
    );
  }
}

final staffCancellationsListProvider = NotifierProvider.family<
    StaffCancellationsListController,
    StaffCancellationsListState,
    CancellationStatus>(StaffCancellationsListController.new);

// ─────────────────── "requested" badge for the bottom nav ────────────────────

class StaffPendingCancellationsCountController extends AsyncNotifier<int> {
  Future<int> _fetch() async {
    final token = await _idToken();
    final res = await ref.read(cancellationsApiProvider).listForStaff(
          idToken: token,
          page: 1,
          pageSize: 1,
          status: CancellationStatus.requested,
        );
    return res.total;
  }

  @override
  Future<int> build() => _fetch();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_fetch);
  }
}

final staffPendingCancellationsCountProvider =
    AsyncNotifierProvider<StaffPendingCancellationsCountController, int>(
  StaffPendingCancellationsCountController.new,
);

final hasPendingCancellationsProvider = Provider<bool>((ref) {
  return (ref.watch(staffPendingCancellationsCountProvider).value ?? 0) > 0;
});

// ─────────────────────── Per-cancellation detail controller ─────────────────

class StaffCancellationDetailController
    extends AsyncNotifier<StaffCancellationDetail> {
  StaffCancellationDetailController(this.cancellationId);

  final String cancellationId;

  @override
  Future<StaffCancellationDetail> build() async {
    final token = await _idToken();
    return ref.read(cancellationsApiProvider).getDetail(
          idToken: token,
          cancellationId: cancellationId,
        );
  }

  Future<void> _refetch() async {
    final token = await _idToken();
    state = AsyncData(
      await ref.read(cancellationsApiProvider).getDetail(
            idToken: token,
            cancellationId: cancellationId,
          ),
    );
  }

  /// Approve or reject this cancellation request. [decision] must be
  /// `approved` or `rejected` — the API throws on `requested`. Refetches
  /// detail and nudges list+badge so the surrounding UI updates.
  Future<void> decide({
    required CancellationStatus decision,
    String? comment,
  }) async {
    final token = await _idToken();
    await ref.read(cancellationsApiProvider).decide(
          idToken: token,
          cancellationId: cancellationId,
          decision: decision,
          comment: comment,
        );
    // Drop from the "requested" list and force a refetch on the destination
    // tab the user might switch into.
    ref
        .read(staffCancellationsListProvider(CancellationStatus.requested)
            .notifier)
        .removeRow(cancellationId);
    ref
        .read(staffCancellationsListProvider(decision).notifier)
        .refresh();
    ref.read(staffPendingCancellationsCountProvider.notifier).refresh();
    await _refetch();
  }
}

final staffCancellationDetailProvider = AsyncNotifierProvider.autoDispose
    .family<StaffCancellationDetailController, StaffCancellationDetail,
        String>(
  StaffCancellationDetailController.new,
);
