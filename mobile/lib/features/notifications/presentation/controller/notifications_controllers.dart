import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/notifications_api.dart';
import '../../data/notifications_api_provider.dart';
import '../../domain/notification_item.dart';

Future<String> _idToken() async {
  final u = fb.FirebaseAuth.instance.currentUser;
  if (u == null) throw StateError('not_authenticated');
  final token = await u.getIdToken();
  if (token == null) throw StateError('no_id_token');
  return token;
}

/// Inbox list. Loaded once on page-open; pull-to-refresh re-fetches.
class NotificationsInboxController
    extends AsyncNotifier<List<NotificationItem>> {
  NotificationsApi get _api => ref.read(notificationsApiProvider);

  @override
  Future<List<NotificationItem>> build() async {
    final token = await _idToken();
    return _api.list(token);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final token = await _idToken();
      return _api.list(token);
    });
  }
}

final notificationsInboxProvider = AsyncNotifierProvider<
    NotificationsInboxController, List<NotificationItem>>(
  NotificationsInboxController.new,
);

/// Unread count for the cabinet badge. Kept separate from the inbox so it can
/// be refreshed independently (e.g. after returning from the inbox page where
/// we just marked everything read).
class NotificationsUnreadCountController extends AsyncNotifier<int> {
  NotificationsApi get _api => ref.read(notificationsApiProvider);

  @override
  Future<int> build() async {
    final token = await _idToken();
    return _api.unreadCount(token);
  }

  Future<void> refresh() async {
    final token = await _idToken();
    final n = await _api.unreadCount(token);
    state = AsyncData(n);
  }

  /// Optimistic local zero — used right after we POST mark-read so the badge
  /// disappears without waiting on the round-trip.
  void setZero() {
    state = const AsyncData(0);
  }
}

final notificationsUnreadCountProvider =
    AsyncNotifierProvider<NotificationsUnreadCountController, int>(
  NotificationsUnreadCountController.new,
);

/// Fire-and-forget mark-all-read. Updates the badge optimistically and
/// reconciles by re-fetching the inbox so cards render `readAt != null`.
/// Takes [WidgetRef] because the only caller is a ConsumerStatefulWidget;
/// promote to a Ref-friendly version when a non-widget caller appears.
Future<void> markAllNotificationsRead(WidgetRef ref) async {
  final api = ref.read(notificationsApiProvider);
  ref.read(notificationsUnreadCountProvider.notifier).setZero();
  try {
    final token = await _idToken();
    await api.markAllRead(token);
    await ref.read(notificationsInboxProvider.notifier).refresh();
  } catch (_) {
    // best-effort: leave the badge at zero (we already showed it that way).
    // The next cabinet open will re-fetch the real count.
  }
}
