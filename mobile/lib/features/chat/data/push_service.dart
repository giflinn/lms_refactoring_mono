import 'dart:async';
import 'dart:io';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/log.dart';
import '../../../core/push_preference.dart';
import '../../../core/router/app_router.dart';
import 'chat_api.dart';
import 'chat_api_provider.dart';

/// FCM lifecycle:
///   1. App boot → request notification permission, configure foreground
///      presentation, listen for incoming and tap-opened messages.
///   2. After sign-in → register the current FCM token with the backend.
///   3. Token rotates → re-register.
///   4. Sign-out → unregister from the backend.
///
/// We intentionally don't subscribe to topics / use the device-group API. The
/// backend stores per-user tokens in user_fcm_tokens and decides per-message
/// whether to push (only when the recipient is offline).
class PushService {
  final ChatApi _api;
  final Ref _ref;
  StreamSubscription<RemoteMessage>? _onMessageSub;
  StreamSubscription<RemoteMessage>? _onMessageOpenedSub;
  StreamSubscription<String>? _onTokenSub;
  String? _lastToken;

  PushService({required ChatApi api, required Ref ref})
      : _api = api,
        _ref = ref;

  static Future<void> initEarly() async {
    // Foreground presentation on iOS — without this notifications are silent
    // while the app is in the foreground. We rely on the in-app socket
    // emission for live updates and only show the OS banner when backgrounded,
    // so this just prevents a confusing "missed" feel on iOS.
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );
  }

  Future<void> requestPermissionAndStart() async {
    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    } catch (e) {
      logd('[push] requestPermission failed', e);
    }

    _onMessageSub ??= FirebaseMessaging.onMessage.listen((message) {
      // No-op: the live socket already updates the UI when the app is in the
      // foreground. We let the OS handle the notification banner per the
      // setForegroundNotificationPresentationOptions config above.
    });

    _onMessageOpenedSub ??=
        FirebaseMessaging.onMessageOpenedApp.listen(_handleOpened);

    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) _handleOpened(initial);

    _onTokenSub ??= FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      _lastToken = token;
      unawaited(_registerCurrent());
    });
  }

  void _handleOpened(RemoteMessage message) {
    final data = message.data;
    final type = data['type'] as String?;
    if (type == null) return;
    final router = _ref.read(routerProvider);
    // Microtask so the router can finish any pending redirect before we push
    // (cold-start path).
    scheduleMicrotask(() {
      switch (type) {
        case 'chat_message':
          final threadId = data['threadId'] as String?;
          if (threadId != null) router.push('/staff/chat/$threadId');
        case 'order_payment_status':
        case 'order_fulfillment_status':
        case 'telegram_access_granted':
        case 'telegram_access_revoked':
          final orderId = data['orderId'] as String?;
          if (orderId != null) {
            router.push('/client/purchases/$orderId');
          } else {
            router.push('/client/purchases');
          }
        default:
          // Unknown push type — leave the user where they are. Future event
          // types should be added explicitly above.
          break;
      }
    });
  }

  /// Registers the current FCM token with the backend. Call after sign-in.
  /// No-op (and skips the OS permission prompt) if the user has turned pushes
  /// off in Settings — re-enabling there calls this again.
  Future<void> registerForCurrentUser() async {
    final enabled = await _ref.read(pushPreferenceProvider.future);
    if (!enabled) return;
    await requestPermissionAndStart();
    _lastToken ??= await FirebaseMessaging.instance.getToken();
    await _registerCurrent();
  }

  Future<void> _registerCurrent() async {
    final enabled = _ref.read(pushPreferenceProvider).value ?? true;
    if (!enabled) return;
    final token = _lastToken;
    if (token == null) return;
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) return;
    try {
      final idToken = await fbUser.getIdToken();
      if (idToken == null) return;
      await _api.registerFcmToken(
        idToken: idToken,
        token: token,
        platform: Platform.isIOS ? 'ios' : 'android',
      );
    } catch (e) {
      logd('[push] register token failed', e);
    }
  }

  /// Removes the device's token from the backend (called on sign-out).
  Future<void> unregisterCurrentDevice() async {
    final token = _lastToken;
    if (token == null) return;
    final fbUser = fb.FirebaseAuth.instance.currentUser;
    if (fbUser == null) return;
    try {
      final idToken = await fbUser.getIdToken();
      if (idToken == null) return;
      await _api.deleteFcmToken(idToken: idToken, token: token);
    } catch (e) {
      logd('[push] unregister token failed', e);
    }
  }
}

final pushServiceProvider = Provider<PushService>((ref) {
  return PushService(
    api: ref.watch(chatApiProvider),
    ref: ref,
  );
});
