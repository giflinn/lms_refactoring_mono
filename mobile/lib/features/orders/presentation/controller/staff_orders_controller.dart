import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/log.dart';
import '../../data/orders_api_provider.dart';
import '../../domain/staff_order.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

const _pageSize = 20;
const _searchDebounceMs = 350;

class StaffOrdersListState {
  final List<StaffOrder> orders;
  final FulfillmentStatus tab;
  final String query;
  final int page;
  final int total;
  final bool loadingFirst;
  final bool loadingMore;
  final bool hasMore;
  final Object? error;

  const StaffOrdersListState({
    required this.orders,
    required this.tab,
    required this.query,
    required this.page,
    required this.total,
    required this.loadingFirst,
    required this.loadingMore,
    required this.hasMore,
    required this.error,
  });

  factory StaffOrdersListState.initial(FulfillmentStatus tab) =>
      StaffOrdersListState(
        orders: const [],
        tab: tab,
        query: '',
        page: 1,
        total: 0,
        loadingFirst: false,
        loadingMore: false,
        hasMore: false,
        error: null,
      );

  StaffOrdersListState copyWith({
    List<StaffOrder>? orders,
    FulfillmentStatus? tab,
    String? query,
    int? page,
    int? total,
    bool? loadingFirst,
    bool? loadingMore,
    bool? hasMore,
    Object? error,
    bool clearError = false,
  }) {
    return StaffOrdersListState(
      orders: orders ?? this.orders,
      tab: tab ?? this.tab,
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

/// Paginated orders list, keyed by fulfillment-status tab. Each tab keeps
/// its own state instance so switching tabs doesn't blow away the scroll
/// position or refetch what the user was just looking at.
class StaffOrdersListController extends Notifier<StaffOrdersListState> {
  StaffOrdersListController(this.tab);

  final FulfillmentStatus tab;

  Timer? _searchDebounce;
  int _requestSeq = 0;

  @override
  StaffOrdersListState build() {
    ref.onDispose(() => _searchDebounce?.cancel());
    Future.microtask(refresh);
    return StaffOrdersListState.initial(tab);
  }

  Future<void> refresh() async {
    final seq = ++_requestSeq;
    state = state.copyWith(loadingFirst: true, clearError: true);
    try {
      final token = await _idToken();
      final res = await ref.read(ordersApiProvider).listForStaff(
            idToken: token,
            query: state.query.trim().isEmpty ? null : state.query.trim(),
            page: 1,
            pageSize: _pageSize,
            fulfillmentStatus: tab,
          );
      if (seq != _requestSeq) return;
      state = state.copyWith(
        orders: res.orders,
        page: 1,
        total: res.total,
        loadingFirst: false,
        loadingMore: false,
        hasMore: res.orders.length < res.total,
      );
    } catch (e, st) {
      if (seq != _requestSeq) return;
      logd('staff_orders refresh failed', e, st);
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
      final res = await ref.read(ordersApiProvider).listForStaff(
            idToken: token,
            query: state.query.trim().isEmpty ? null : state.query.trim(),
            page: nextPage,
            pageSize: _pageSize,
            fulfillmentStatus: tab,
          );
      if (seq != _requestSeq) return;
      final merged = [...state.orders, ...res.orders];
      state = state.copyWith(
        orders: merged,
        page: nextPage,
        total: res.total,
        loadingMore: false,
        hasMore: merged.length < res.total,
      );
    } catch (e, st) {
      if (seq != _requestSeq) return;
      logd('staff_orders loadMore failed', e, st);
      state = state.copyWith(loadingMore: false, error: e);
    }
  }

  /// Debounced search. The search field is shared across tabs; the page
  /// pushes the same value into every tab's controller so flipping tabs
  /// doesn't reset the search.
  void setQuery(String value) {
    if (state.query == value) return;
    state = state.copyWith(query: value, clearError: true);
    _searchDebounce?.cancel();
    _searchDebounce = Timer(
      const Duration(milliseconds: _searchDebounceMs),
      refresh,
    );
  }

  /// Replace a single in-list order after a status patch — avoids a full
  /// refetch when the row's id is already on screen. If the new fulfillment
  /// status no longer matches this tab, drop it from the list.
  void replaceOrder(StaffOrder order) {
    final i = state.orders.indexWhere((o) => o.id == order.id);
    if (i < 0) return;
    if (order.fulfillmentStatus != tab) {
      final updated = [...state.orders]..removeAt(i);
      state = state.copyWith(orders: updated, total: state.total - 1);
      return;
    }
    final updated = [...state.orders];
    updated[i] = order;
    state = state.copyWith(orders: updated);
  }
}

final staffOrdersListProvider = NotifierProvider.family<
    StaffOrdersListController,
    StaffOrdersListState,
    FulfillmentStatus>(StaffOrdersListController.new);

// ─────────────────────── "new" badge for the bottom nav ──────────────────────

/// Lightweight count of unfulfilled `new` orders in the actor's scope.
/// Drives the red dot on the bottom-nav "Заказы" item. Refreshed at app
/// init and whenever a status patch fires (see [StaffOrderDetailController]).
class StaffNewOrdersCountController extends AsyncNotifier<int> {
  Future<int> _fetch() async {
    final token = await _idToken();
    final res = await ref.read(ordersApiProvider).listForStaff(
          idToken: token,
          page: 1,
          pageSize: 1,
          fulfillmentStatus: FulfillmentStatus.newOrder,
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

final staffNewOrdersCountProvider =
    AsyncNotifierProvider<StaffNewOrdersCountController, int>(
  StaffNewOrdersCountController.new,
);

final hasNewStaffOrdersProvider = Provider<bool>((ref) {
  return (ref.watch(staffNewOrdersCountProvider).value ?? 0) > 0;
});

// ─────────────────────── Per-order detail controller ────────────────────────

/// AutoDispose family — one detail controller per orderId, alive only while
/// the detail page is on screen. Backed by GET /orders/:id; PATCH goes
/// through [patchPayment] / [patchFulfillment].
class StaffOrderDetailController extends AsyncNotifier<StaffOrderDetail> {
  StaffOrderDetailController(this.orderId);

  final String orderId;

  @override
  Future<StaffOrderDetail> build() async {
    final token = await _idToken();
    return ref.read(ordersApiProvider).getOrder(
          idToken: token,
          orderId: orderId,
        );
  }

  Future<void> _refetch() async {
    final token = await _idToken();
    state = AsyncData(
      await ref.read(ordersApiProvider).getOrder(
            idToken: token,
            orderId: orderId,
          ),
    );
  }

  /// Apply [target] payment status. On success: refetch (the backend may
  /// have set firstPaidAt), nudge the list and the badge counter. Throws
  /// OrderPatchException on a backend error code.
  Future<void> patchPayment(PaymentStatus target) async {
    final token = await _idToken();
    final patched = await ref.read(ordersApiProvider).patchOrder(
          idToken: token,
          orderId: orderId,
          paymentStatus: target,
        );
    _propagate(patched);
    await _refetch();
  }

  /// Apply [target] fulfillment status. Pass [force]=true after the user
  /// confirms in the BookingConflictDialog so the backend drops conflicting
  /// bookings instead of throwing again.
  Future<void> patchFulfillment(
    FulfillmentStatus target, {
    bool force = false,
  }) async {
    final token = await _idToken();
    final patched = await ref.read(ordersApiProvider).patchOrder(
          idToken: token,
          orderId: orderId,
          fulfillmentStatus: target,
          force: force,
        );
    _propagate(patched);
    await _refetch();
  }

  void _propagate(StaffOrder updated) {
    for (final tab in FulfillmentStatus.values) {
      ref
          .read(staffOrdersListProvider(tab).notifier)
          .replaceOrder(updated);
    }
    ref.read(staffNewOrdersCountProvider.notifier).refresh();
  }
}

final staffOrderDetailProvider = AsyncNotifierProvider.autoDispose
    .family<StaffOrderDetailController, StaffOrderDetail, String>(
  StaffOrderDetailController.new,
);
