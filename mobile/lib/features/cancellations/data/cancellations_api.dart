import 'dart:convert';
import 'dart:io';

import '../../../core/network/api_client.dart';
import '../domain/cancellation.dart';

/// Error returned by PATCH /cancellations/:id. Notable codes:
/// - `cancellation_already_decided` (409) — somebody else already decided
///   this row (race between two staff windows).
/// - `forbidden` (403) — manager opened deep-link to a non-own request.
class CancellationDecisionException implements Exception {
  final String code;
  final int statusCode;

  const CancellationDecisionException({
    required this.code,
    required this.statusCode,
  });

  @override
  String toString() =>
      'CancellationDecisionException($code, http=$statusCode)';
}

class CancellationsApi {
  final ApiClient _client;

  CancellationsApi(this._client);

  Future<StaffCancellationsPage> listForStaff({
    required String idToken,
    String? query,
    int page = 1,
    int pageSize = 20,
    CancellationStatus? status,
  }) async {
    final qp = <String>['page=$page', 'pageSize=$pageSize'];
    if (query != null && query.isNotEmpty) {
      qp.add('q=${Uri.encodeQueryComponent(query)}');
    }
    if (status != null) {
      qp.add('status=${cancellationStatusToString(status)}');
    }
    final path = '/cancellations?${qp.join('&')}';
    final res = await _client.get(path, idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET $path: ${res.statusCode}');
    }
    return StaffCancellationsPage.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<StaffCancellationDetail> getDetail({
    required String idToken,
    required String cancellationId,
  }) async {
    final res = await _client.get(
      '/cancellations/$cancellationId',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
        'GET /cancellations/$cancellationId: ${res.statusCode}',
      );
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return StaffCancellationDetail.fromJson(
      json['cancellation'] as Map<String, dynamic>,
    );
  }

  /// PATCH /cancellations/:id — apply staff decision. [decision] is one of
  /// `'approved'` / `'rejected'`. [comment] is optional and clamped server-
  /// side to 1000 chars.
  Future<void> decide({
    required String idToken,
    required String cancellationId,
    required CancellationStatus decision,
    String? comment,
  }) async {
    if (decision != CancellationStatus.approved &&
        decision != CancellationStatus.rejected) {
      throw ArgumentError('decide accepts only approved/rejected');
    }
    final body = <String, Object>{
      'decision': cancellationStatusToString(decision),
      if (comment != null && comment.trim().isNotEmpty)
        'comment': comment.trim(),
    };
    final res = await _client.patchJson(
      '/cancellations/$cancellationId',
      idToken: idToken,
      body: body,
    );
    if (res.statusCode == 200) return;
    throw CancellationDecisionException(
      code: ApiClient.parseErrorCode(res.body),
      statusCode: res.statusCode,
    );
  }
}
