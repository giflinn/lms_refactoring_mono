import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/log.dart';
import '../../data/reviews_api_provider.dart';
import '../../domain/review.dart';

class ProductReviewsState {
  final List<Review> reviews;
  final String? cursor;
  final bool loadingFirst;
  final bool loadingMore;
  final bool reachedEnd;
  final Object? error;

  const ProductReviewsState({
    required this.reviews,
    required this.cursor,
    required this.loadingFirst,
    required this.loadingMore,
    required this.reachedEnd,
    required this.error,
  });

  const ProductReviewsState.initial()
      : reviews = const [],
        cursor = null,
        loadingFirst = true,
        loadingMore = false,
        reachedEnd = false,
        error = null;

  ProductReviewsState copyWith({
    List<Review>? reviews,
    String? cursor,
    bool? loadingFirst,
    bool? loadingMore,
    bool? reachedEnd,
    Object? error,
    bool clearError = false,
    bool clearCursor = false,
  }) {
    return ProductReviewsState(
      reviews: reviews ?? this.reviews,
      cursor: clearCursor ? null : (cursor ?? this.cursor),
      loadingFirst: loadingFirst ?? this.loadingFirst,
      loadingMore: loadingMore ?? this.loadingMore,
      reachedEnd: reachedEnd ?? this.reachedEnd,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// Cursor-paginated public reviews for a single product. The same controller
/// powers the snippet on `ProductDetailPage` (it just slices the first 3) and
/// the dedicated `/client/products/:id/reviews` page (which renders all and
/// triggers `loadMore` on scroll).
class ProductReviewsController extends Notifier<ProductReviewsState> {
  ProductReviewsController(this.productId);

  final String productId;
  int _seq = 0;

  @override
  ProductReviewsState build() {
    Future.microtask(refresh);
    return const ProductReviewsState.initial();
  }

  Future<void> refresh() async {
    final mySeq = ++_seq;
    state = state.copyWith(loadingFirst: true, clearError: true);
    try {
      final res = await ref
          .read(reviewsApiProvider)
          .listForProduct(productId: productId);
      if (mySeq != _seq) return;
      state = ProductReviewsState(
        reviews: res.reviews,
        cursor: res.nextCursor,
        loadingFirst: false,
        loadingMore: false,
        reachedEnd: res.nextCursor == null,
        error: null,
      );
    } catch (e, st) {
      if (mySeq != _seq) return;
      logd('product_reviews refresh failed', e, st);
      state = state.copyWith(loadingFirst: false, error: e);
    }
  }

  Future<void> loadMore() async {
    if (state.loadingFirst ||
        state.loadingMore ||
        state.reachedEnd ||
        state.error != null ||
        state.cursor == null) {
      return;
    }
    final mySeq = _seq;
    state = state.copyWith(loadingMore: true);
    try {
      final res = await ref.read(reviewsApiProvider).listForProduct(
            productId: productId,
            cursor: state.cursor,
          );
      if (mySeq != _seq) return;
      state = state.copyWith(
        reviews: [...state.reviews, ...res.reviews],
        cursor: res.nextCursor,
        loadingMore: false,
        reachedEnd: res.nextCursor == null,
        clearCursor: res.nextCursor == null,
      );
    } catch (e, st) {
      if (mySeq != _seq) return;
      logd('product_reviews loadMore failed', e, st);
      state = state.copyWith(loadingMore: false, error: e);
    }
  }
}

final productReviewsProvider = NotifierProvider.family<
    ProductReviewsController,
    ProductReviewsState,
    String>(ProductReviewsController.new);
