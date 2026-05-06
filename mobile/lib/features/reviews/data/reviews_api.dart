import 'dart:convert';
import 'dart:io';

import '../../../core/network/api_client.dart';
import '../domain/review.dart';

/// Snake-case error code returned by the reviews backend. Codes the UI
/// switches on:
/// - `text_too_short`, `text_too_long`, `invalid_rating` — form validation
///   that didn't make it past the server (mobile pre-validates but the
///   server is the source of truth).
/// - `no_completed_order` — client tried to submit for a product they
///   haven't bought yet (race between order list refresh and submit).
/// - `review_not_found`, `reply_not_found` — stale state.
/// - `review_deleted`, `review_not_published` — moderation state moved
///   under us.
/// - `forbidden` — the calling actor isn't allowed (manager scoping).
class ReviewException implements Exception {
  final String code;
  final int statusCode;

  const ReviewException({required this.code, required this.statusCode});

  @override
  String toString() => 'ReviewException($code, http=$statusCode)';
}

class ReviewsApi {
  final ApiClient _client;

  ReviewsApi(this._client);

  // ------- client (mobile) -------

  Future<String> submit({
    required String idToken,
    required String productId,
    required int rating,
    required String text,
  }) async {
    final res = await _client.postJson(
      '/me/reviews',
      idToken: idToken,
      body: {'productId': productId, 'rating': rating, 'text': text},
    );
    if (res.statusCode == 200) {
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return (json['review'] as Map<String, dynamic>)['id'] as String;
    }
    throw ReviewException(
      code: ApiClient.parseErrorCode(res.body),
      statusCode: res.statusCode,
    );
  }

  Future<List<Review>> listMine(String idToken) async {
    final res = await _client.get('/me/reviews', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /me/reviews: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['reviews'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(Review.fromJson)
        .toList();
  }

  Future<void> edit({
    required String idToken,
    required String reviewId,
    required int rating,
    required String text,
  }) async {
    final res = await _client.patchJson(
      '/me/reviews/$reviewId',
      idToken: idToken,
      body: {'rating': rating, 'text': text},
    );
    if (res.statusCode != 200) {
      throw ReviewException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
  }

  Future<void> deleteByClient({
    required String idToken,
    required String reviewId,
  }) async {
    final res = await _client.delete(
      '/me/reviews/$reviewId',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw ReviewException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
  }

  // ------- public (no auth) -------

  /// Public feed of published reviews on a product. [cursor] is the
  /// `nextCursor` returned by the previous page (or null for the first page).
  Future<({List<Review> reviews, String? nextCursor})> listForProduct({
    required String productId,
    String? cursor,
    int limit = 20,
  }) async {
    final qp = <String>['limit=$limit'];
    if (cursor != null && cursor.isNotEmpty) {
      qp.add('cursor=${Uri.encodeQueryComponent(cursor)}');
    }
    final path = '/products/$productId/reviews?${qp.join('&')}';
    final res = await _client.get(path);
    if (res.statusCode != 200) {
      throw HttpException('GET $path: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    final reviews = (json['reviews'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(Review.fromJson)
        .toList();
    return (reviews: reviews, nextCursor: json['nextCursor'] as String?);
  }

  // ------- staff -------

  Future<({List<Review> reviews, int total, int page, int pageSize})>
      listForStaff({
    required String idToken,
    ReviewStatus? status,
    String? query,
    String? clientId,
    int page = 1,
    int pageSize = 20,
  }) async {
    final qp = <String>['page=$page', 'pageSize=$pageSize'];
    if (status != null) qp.add('status=${_statusToString(status)}');
    if (query != null && query.isNotEmpty) {
      qp.add('q=${Uri.encodeQueryComponent(query)}');
    }
    if (clientId != null && clientId.isNotEmpty) {
      qp.add('clientId=${Uri.encodeQueryComponent(clientId)}');
    }
    final path = '/reviews?${qp.join('&')}';
    final res = await _client.get(path, idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET $path: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (
      reviews: (json['reviews'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(Review.fromJson)
          .toList(),
      total: json['total'] as int,
      page: json['page'] as int,
      pageSize: json['pageSize'] as int,
    );
  }

  Future<int> pendingCount(String idToken) async {
    final res = await _client.get(
      '/reviews/pending-count',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException('GET /reviews/pending-count: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['total'] as num).toInt();
  }

  Future<void> moderate({
    required String idToken,
    required String reviewId,
    required ReviewModerationAction action,
  }) async {
    final res = await _client.patchJson(
      '/reviews/$reviewId',
      idToken: idToken,
      body: {'action': action == ReviewModerationAction.publish
          ? 'publish'
          : 'delete'},
    );
    if (res.statusCode != 200) {
      throw ReviewException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
  }

  Future<String> reply({
    required String idToken,
    required String reviewId,
    required String text,
  }) async {
    final res = await _client.postJson(
      '/reviews/$reviewId/reply',
      idToken: idToken,
      body: {'text': text},
    );
    if (res.statusCode == 200) {
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      return (json['reply'] as Map<String, dynamic>)['id'] as String;
    }
    throw ReviewException(
      code: ApiClient.parseErrorCode(res.body),
      statusCode: res.statusCode,
    );
  }

  Future<void> deleteReply({
    required String idToken,
    required String replyId,
  }) async {
    final res = await _client.delete(
      '/reviews/replies/$replyId',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw ReviewException(
        code: ApiClient.parseErrorCode(res.body),
        statusCode: res.statusCode,
      );
    }
  }

  String _statusToString(ReviewStatus s) {
    switch (s) {
      case ReviewStatus.pending:
        return 'pending';
      case ReviewStatus.published:
        return 'published';
      case ReviewStatus.deleted:
        return 'deleted';
    }
  }
}

enum ReviewModerationAction { publish, delete }
