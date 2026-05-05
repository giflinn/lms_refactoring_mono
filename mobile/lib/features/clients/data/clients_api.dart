import 'dart:convert';
import 'dart:io';

import '../../../core/network/api_client.dart';
import '../../orders/domain/order.dart';
import '../domain/client.dart';

/// Backend rejection of `PATCH /clients/:id`. Codes the page maps to
/// per-field UI: `invalid_phone`, `invalid_birth_date`, `invalid_client_category`,
/// `forbidden`, `client_not_found`.
class ClientUpdateException implements Exception {
  final int statusCode;
  final String code;
  ClientUpdateException(this.statusCode, this.code);

  @override
  String toString() => 'ClientUpdateException($statusCode, $code)';
}

class ClientsApi {
  final ApiClient _client;
  ClientsApi(this._client);

  /// Paginated list. The staff list page calls this with [page] = 1 on first
  /// load, then increments on scroll. Manager-role actors only see their
  /// assigned clients (backend handles the scoping).
  Future<ClientsPage> list({
    required String idToken,
    String? query,
    int page = 1,
    int pageSize = 20,
  }) async {
    final params = <String, String>{
      'page': page.toString(),
      'pageSize': pageSize.toString(),
    };
    final q = query?.trim();
    if (q != null && q.isNotEmpty) params['q'] = q;
    final qs = Uri(queryParameters: params).query;
    final res = await _client.get('/clients?$qs', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /clients: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return ClientsPage(
      clients: (json['clients'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .map(Client.fromJson)
          .toList(),
      page: json['page'] as int,
      pageSize: json['pageSize'] as int,
      total: json['total'] as int,
    );
  }

  /// Partial update. We only edit `comment` from the staff profile screen
  /// today; the API supports phone / birthDate / clientCategory / managerId
  /// too — exposed via named params so the UI can opt in later.
  Future<Client> update({
    required String idToken,
    required String clientId,
    String? phone,
    String? comment,
    String? birthDate,
    String? clientCategory,
  }) async {
    final body = <String, Object?>{};
    if (phone != null) body['phone'] = phone;
    if (comment != null) body['comment'] = comment;
    if (birthDate != null) body['birthDate'] = birthDate;
    if (clientCategory != null) body['clientCategory'] = clientCategory;

    final res = await _client.patchJson(
      '/clients/$clientId',
      idToken: idToken,
      body: body,
    );
    if (res.statusCode != 200) {
      throw ClientUpdateException(
        res.statusCode,
        ApiClient.parseErrorCode(res.body),
      );
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return Client.fromJson(json['client'] as Map<String, dynamic>);
  }

  /// Staff "История покупок" — payload mirrors `/me/orders` so the existing
  /// client-side `OrderCard` and `ClientOrder.fromJson` work as-is.
  Future<List<ClientOrder>> listOrders({
    required String idToken,
    required String clientId,
  }) async {
    final res = await _client.get(
      '/clients/$clientId/orders',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException('GET /clients/$clientId/orders: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['orders'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(ClientOrder.fromJson)
        .toList();
  }
}
