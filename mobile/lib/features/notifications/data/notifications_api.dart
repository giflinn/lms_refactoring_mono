import 'dart:convert';
import 'dart:io';

import '../../../core/network/api_client.dart';
import '../../notifications/domain/notification_item.dart';

class NotificationsApi {
  final ApiClient _client;
  NotificationsApi(this._client);

  Future<List<NotificationItem>> list(String idToken) async {
    final res = await _client.get('/me/notifications', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException('GET /me/notifications: ${res.statusCode}');
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    final items = (json['notifications'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(NotificationItem.fromJson)
        .toList();
    return items;
  }

  Future<int> unreadCount(String idToken) async {
    final res =
        await _client.get('/me/notifications/unread-count', idToken: idToken);
    if (res.statusCode != 200) {
      throw HttpException(
        'GET /me/notifications/unread-count: ${res.statusCode}',
      );
    }
    final json = jsonDecode(res.body) as Map<String, dynamic>;
    return (json['count'] as int?) ?? 0;
  }

  Future<void> markAllRead(String idToken) async {
    final res = await _client.postJson(
      '/me/notifications/mark-read',
      idToken: idToken,
    );
    if (res.statusCode != 200) {
      throw HttpException(
        'POST /me/notifications/mark-read: ${res.statusCode}',
      );
    }
  }
}
