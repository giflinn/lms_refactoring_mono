import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/reviews_api.dart';
import '../../data/reviews_api_provider.dart';
import '../../domain/review.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

/// Drives the "Мои отзывы" page. Holds the calling client's reviews
/// (everything except status='deleted').
class MyReviewsController extends AsyncNotifier<List<Review>> {
  @override
  Future<List<Review>> build() async {
    final token = await _idToken();
    return ref.read(reviewsApiProvider).listMine(token);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final token = await _idToken();
      return ref.read(reviewsApiProvider).listMine(token);
    });
  }

  /// Submit a new review. Errors propagate as [ReviewException] for the page
  /// to render a friendly message.
  Future<void> submit({
    required String productId,
    required int rating,
    required String text,
  }) async {
    final token = await _idToken();
    await ref.read(reviewsApiProvider).submit(
          idToken: token,
          productId: productId,
          rating: rating,
          text: text,
        );
    await refresh();
  }

  Future<void> edit({
    required String reviewId,
    required int rating,
    required String text,
  }) async {
    final token = await _idToken();
    await ref.read(reviewsApiProvider).edit(
          idToken: token,
          reviewId: reviewId,
          rating: rating,
          text: text,
        );
    await refresh();
  }

  Future<void> deleteOne(String reviewId) async {
    final token = await _idToken();
    await ref.read(reviewsApiProvider).deleteByClient(
          idToken: token,
          reviewId: reviewId,
        );
    await refresh();
  }
}

final myReviewsProvider =
    AsyncNotifierProvider<MyReviewsController, List<Review>>(
  MyReviewsController.new,
);
